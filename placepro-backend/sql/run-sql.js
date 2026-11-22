const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const sqlDirectory = __dirname;
const migrationsDirectory = path.join(sqlDirectory, 'migrations');

const migrationFiles = fs
    .readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort();

const files = [
    'schema.updated.sql',
    ...migrationFiles.map((file) => path.join('migrations', file)),
];

if (process.env.RUN_SEEDS === 'true') {
    files.push(
        'seed-demo-students.sql',
        'seed-supplied-cse-rosters.sql',
        'seed.sql',
    );
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && !process.env.DB_HOST) {
    throw new Error(
        'Database configuration missing. Set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME.',
    );
}

const sslEnabled =
    process.env.DB_SSL !== 'false'
    && (Boolean(databaseUrl) || process.env.DB_SSL === 'true');

const client = databaseUrl
    ? new Client({
        connectionString: databaseUrl,
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    })
    : new Client({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'postgres',
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    });

(async () => {
    try {
        await client.connect();
        console.log(`Connected to PostgreSQL at ${databaseUrl ? 'DATABASE_URL' : process.env.DB_HOST}`);

        for (const file of files) {
            const filePath = path.join(sqlDirectory, file);
            const sql = fs.readFileSync(filePath, 'utf8');

            await client.query('BEGIN');
            try {
                console.log(`Running ${file} ...`);
                await client.query(sql);
                await client.query('COMMIT');
                console.log(`Done: ${file}`);
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
        }

        if (process.env.RUN_SEEDS === 'true') {
            console.log('Schema, migrations, and seeds executed successfully.');
        } else {
            console.log('Schema and migrations executed successfully. Seeds skipped.');
        }
    } catch (error) {
        console.error(`Database setup failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
})();
