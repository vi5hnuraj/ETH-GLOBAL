import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL, ssl: (process.env.SUPABASE_DATABASE_URL || '').includes('supabase') ? { rejectUnauthorized: false } : false });
await pool.query("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS world_verified BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS world_verified_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS world_nullifier NUMERIC(78,0)");
const { rowCount } = await pool.query(`UPDATE profiles p SET world_verified = true, world_verified_at = COALESCE(p.world_verified_at, now()) FROM ai_agents a WHERE a.developer_id::uuid = p.id AND a.world_verified = true AND p.world_verified = false`);
console.log('columns added; backfilled verified users:', rowCount);
await pool.end();
