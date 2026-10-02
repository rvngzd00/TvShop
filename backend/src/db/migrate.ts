import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { closePool, pool, withTransaction } from './pool.js';

const migrationDirectory = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');

async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();

  for (const filename of files) {
    const sql = await readFile(join(migrationDirectory, filename), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await pool.query<{ checksum: string }>(
      'SELECT checksum FROM schema_migrations WHERE filename = $1',
      [filename]
    );

    if (existing.rowCount) {
      if (existing.rows[0]?.checksum !== checksum) {
        throw new Error(`Applied migration was modified: ${filename}`);
      }
      continue;
    }

    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
        [filename, checksum]
      );
    });
    console.log(`Applied ${filename}`);
  }
}

migrate()
  .then(closePool)
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exitCode = 1;
  });
