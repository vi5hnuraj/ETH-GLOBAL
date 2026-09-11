import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ [Migration] Error: SUPABASE_DATABASE_URL or DATABASE_URL environment variable is not defined.');
  process.exit(1);
}

const migrationFilePaths = [
  path.resolve(process.cwd(), './src/config/agents_migration.sql'),
  path.resolve(process.cwd(), './scripts/migrations/create_agentkit_usage.sql'),
  path.resolve(process.cwd(), './scripts/migrations/create_world_id_nullifiers.sql')
];

async function run() {
  console.log('🚀 Starting Database Migrations for Production...');
  
  const sqlContent = migrationFilePaths.map((migrationFilePath) => {
    if (!fs.existsSync(migrationFilePath)) {
      throw new Error(`SQL migration file not found at: ${migrationFilePath}`);
    }
    const sql = fs.readFileSync(migrationFilePath, 'utf8');
    console.log(`✔️ Loaded ${path.basename(migrationFilePath)} (${(sql.length / 1024).toFixed(2)} KB).`);
    return sql;
  }).join('\n');

  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes('supabase.co') || connectionString.includes('pooler.supabase.com')
      ? { rejectUnauthorized: false }
      : false,
  });

  const client = await pool.connect();
  try {
    console.log('🔌 Connected to PostgreSQL Database. Applying SQL scripts...');
    
    // Execute all queries in a single multi-statement block
    await client.query('BEGIN');
    await client.query(sqlContent);
    await client.query('COMMIT');
    
    console.log('✅ [Migration] Database migrations applied successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ [Migration] Fatal error applying migration:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
