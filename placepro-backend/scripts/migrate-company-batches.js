const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../src/config/db');

(async () => {
  const client = await pool.connect();
  try {
    await client.query(fs.readFileSync(path.join(__dirname, '../sql/migrations/20261119_company_eligible_batches.sql'), 'utf8'));
    console.log('Company eligible-batch migration applied. Configure eligible batches for existing companies in Admin > Company Requirements.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
})().catch(error => { console.error('Migration failed:', error.message); process.exitCode = 1; })
  .finally(() => pool.end());
