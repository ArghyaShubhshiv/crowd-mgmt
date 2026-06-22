#!/usr/bin/env bash
#
# run-stack.sh — run the ConPulse pipeline.
#
#   ./run-stack.sh                 # run services against existing infra + data (NON-destructive)
#   ./run-stack.sh 120             # ...with 120 simulated visitors
#   ./run-stack.sh --seed          # seed the demo event+zones if missing, then run (keeps data)
#   ./run-stack.sh --fresh         # wipe volumes, migrate, seed from scratch, then run
#   ./run-stack.sh --fresh 200     # ...fresh + 200 visitors
#   ./run-stack.sh --no-feed       # start services but don't launch the feeder
#
# Ctrl-C stops node/python services. Infra (docker) is left running.
# Stop infra with:  docker compose -f infra/docker-compose.yml down
#
set -euo pipefail
cd "$(dirname "$0")"

# ----------------------------- args -----------------------------
FRESH=false; SEED=false; RUN_FEED=true; VISITORS=60
for arg in "$@"; do
  case "$arg" in
    --fresh)     FRESH=true ;;
    --seed)      SEED=true ;;
    --no-feed)   RUN_FEED=false ;;
    ''|*[!0-9]*) ;;                       # ignore flags / non-numeric tokens
    *)           VISITORS="$arg" ;;       # a bare number = visitor count
  esac
done

# ----------------------------- config ---------------------------
EVENT_SLUG="summer-fest-2026"
TOPIC="location.${EVENT_SLUG}"            # ← moved to a single shared topic? set TOPIC="locations"
PARTITIONS=6
COMPOSE="docker compose -f infra/docker-compose.yml"
PG=infra-postgres-1; REDIS=infra-redis-1; KAFKA=infra-kafka-1; RABBIT=infra-rabbitmq-1
KAFKA_BIN=/opt/kafka/bin
PG_USER=crowd; PG_DB=crowd_mgmt
PIDS=()

# ----------------------------- teardown -------------------------
cleanup() {
  echo; echo "🛑 stopping services..."
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  echo "   done. Infra left running — '$COMPOSE down' to stop docker."
}
trap cleanup EXIT INT TERM

# ----------------------------- helpers --------------------------
start() {
  local name="$1"; shift
  echo "▶️  $name"
  "$@" >"logs/${name}.log" 2>&1 &
  PIDS+=($!)
  echo "   pid $! → logs/${name}.log"
}
wait_for() {
  local label="$1"; shift
  printf "⏳ waiting for %s" "$label"
  until "$@" >/dev/null 2>&1; do printf "."; sleep 1; done
  echo " ✅"
}

mkdir -p logs

# ----------------------------- infra ----------------------------
if [ "$FRESH" = true ]; then
  echo "🧹 --fresh: wiping volumes..."
  $COMPOSE down -v
fi
echo "🐳 ensuring infra is up..."
$COMPOSE up -d                            # idempotent: no-op if already running

wait_for "Postgres" docker exec "$PG"     pg_isready -U "$PG_USER" -d "$PG_DB"
wait_for "Redis"    docker exec "$REDIS"  redis-cli ping
wait_for "RabbitMQ" docker exec "$RABBIT" rabbitmq-diagnostics -q ping
wait_for "Kafka"    docker exec "$KAFKA"  "$KAFKA_BIN/kafka-topics.sh" --bootstrap-server localhost:9092 --list

# ------------------------- schema (only on --fresh) -------------
if [ "$FRESH" = true ]; then
  echo "📜 applying schema..."
  docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" < db/migrations/0001_init.sql
  docker exec -i "$PG" psql -U "$PG_USER" -d "$PG_DB" <<'SQL'
ALTER TABLE zones ADD COLUMN IF NOT EXISTS center_lat double precision;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS center_lng double precision;
SQL
fi

# ------------------- seed (idempotent; --fresh or --seed) -------
if [ "$FRESH" = true ] || [ "$SEED" = true ]; then
  echo "🌱 seeding org + event + zones (skipped if already present)..."
  docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" <<SQL
WITH present AS (SELECT 1 FROM events WHERE slug = '${EVENT_SLUG}'),
o AS (
  INSERT INTO orgs (name) SELECT 'Acme Events'
  WHERE NOT EXISTS (SELECT 1 FROM present) RETURNING id
),
e AS (
  INSERT INTO events (org_id, name, slug, status)
  SELECT id, 'Summer Fest 2026', '${EVENT_SLUG}', 'active' FROM o RETURNING id
)
INSERT INTO zones (event_id, name, slug, capacity, warning_threshold, critical_threshold, center_lat, center_lng)
SELECT e.id, v.name, v.slug, v.capacity, v.warning, v.critical, v.lat, v.lng
FROM e, (VALUES
  ('Main Stage','main-stage',5000,50,120,28.6139,77.2090),
  ('Food Court','food-court',2000,30, 80,28.6155,77.2120),
  ('North Gate','north-gate',1000,20, 50,28.6170,77.2095)
) AS v(name,slug,capacity,warning,critical,lat,lng);
SQL
fi

# ----------------------- sanity: is the event seeded? ----------
EVENT_COUNT=$(docker exec "$PG" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT count(*) FROM events WHERE slug='${EVENT_SLUG}';" 2>/dev/null | tr -d '[:space:]' || echo 0)
if [ "${EVENT_COUNT:-0}" = "0" ]; then
  echo "⚠️  no '${EVENT_SLUG}' event in the DB — the dashboard will be empty."
  echo "    re-run with --seed (keeps your data) or --fresh (wipe + reseed)."
fi

# ----------------------------- topic ---------------------------
echo "📮 ensuring topic '$TOPIC' ($PARTITIONS partitions)..."
docker exec "$KAFKA" "$KAFKA_BIN/kafka-topics.sh" --create --if-not-exists \
  --topic "$TOPIC" --bootstrap-server localhost:9092 --partitions "$PARTITIONS" --replication-factor 1

# ----------------------------- services ------------------------
start api            node --env-file=.env services/api/src/index.js
start ws-server      node --env-file=.env services/ws-server/src/index.js
start aggregator     node --env-file=.env services/aggregator/src/index.js
start dashboard-push node --env-file=.env services/dashboard-push/src/index.js
start alert-service  node --env-file=.env services/alert-service/src/index.js

echo "▶️  portal (http.server :8080)"
( cd dashboard/src && python3 -m http.server 8080 ) >logs/portal.log 2>&1 &
PIDS+=($!); echo "   pid $! → logs/portal.log"

sleep 4

if [ "$RUN_FEED" = true ]; then
  start feeder node --env-file=.env simulator/feed.js "$VISITORS"
else
  echo "⏭️  --no-feed: skipping simulator (launch your own feeder when ready)"
fi

MODE=$([ "$FRESH" = true ] && echo fresh || { [ "$SEED" = true ] && echo seed || echo run; })
cat <<EOF

✅ stack is live   (mode: $MODE)
   portal:     http://localhost:8080/live.html
   api health: http://localhost:3001/health
   visitors:   $([ "$RUN_FEED" = true ] && echo "$VISITORS" || echo "none (--no-feed)")

   logs:  tail -f logs/aggregator.log
          tail -f logs/alert-service.log

   Ctrl-C stops services (docker stays up).
EOF

wait