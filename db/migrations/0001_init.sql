-- gen_random_uuid() is built in on Postgres 13+. On older versions, uncomment:
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- orgs: the tenant / account
CREATE TABLE orgs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- users: belong to an org, log in (auth comes in Phase 2)
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_org ON users(org_id);

-- events: a festival — THIS is the streaming tenant
CREATE TABLE events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,   -- the key used in Kafka/Redis: location.{slug}, density:{slug}
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','ended')),
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_org ON events(org_id);

CREATE TABLE memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES orgs(id)  ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);
CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_memberships_org  ON memberships(org_id);

-- zones: per-event; this is where the hardcoded 5/15 thresholds finally live
CREATE TABLE zones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name                text NOT NULL,
  slug                text NOT NULL,         -- e.g. zone_vip_lounge, unique within an event
  capacity            integer,
  center_lat          double precision,
  center_lng          double precision,
  warning_threshold   integer NOT NULL DEFAULT 5,
  critical_threshold  integer NOT NULL DEFAULT 15,
  -- boundary geometry(Polygon, 4326)        -- added with PostGIS in the map phase
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, slug)
);
CREATE INDEX idx_zones_event ON zones(event_id);