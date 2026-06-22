import pg from 'pg';

let pool;

export function getPool() {
  if (!pool) {
    console.log('DB URL >>>', JSON.stringify(process.env.DATABASE_URL))
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  }
  return pool
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}