import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

// Called only with the already verified, uniquely owned journey database.
export async function checkBackupRoundtrip(sourceUrl: URL, owner: Client, verifyCluster: () => Promise<void>) {
  assert(/^\/ootla_demo_journey_[a-f0-9]{32}$/.test(sourceUrl.pathname));
  assert(sourceUrl.hostname === '127.0.0.1' && sourceUrl.port === '55439' && sourceUrl.username === 'ootla' && !sourceUrl.search);
  await verifyCluster();
  const name = 'ootla_demo_restore_' + randomUUID().replaceAll('-', '');
  const targetUrl = new URL(sourceUrl); targetUrl.pathname = '/' + name;
  const source = new Client({ connectionString: sourceUrl.toString() });
  const target = new Client({ connectionString: targetUrl.toString() });
  const root = path.resolve(import.meta.dirname, '..', '.local', 'backup-check');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, 'roundtrip-'));
  const dump = path.join(directory, 'fixture.dump');
  let owned = false, sourceConnected = false, targetConnected = false;
  const run = async (binary: string, args: string[], url: URL) => {
    const filename = binary + (process.platform === 'win32' ? '.exe' : '');
    const executable = process.env.PGBIN ? path.join(process.env.PGBIN, filename) : filename;
    try {
      await promisify(execFile)(executable, args, { windowsHide: true, timeout: 90000,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
          PGHOST: url.hostname, PGPORT: url.port, PGUSER: decodeURIComponent(url.username),
          PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: url.pathname.slice(1), PGSSLMODE: 'disable' } });
    } catch { throw new Error('Backup verification command failed; credentials and raw process output are omitted. Check PostgreSQL client availability.'); }
  };
  const fingerprint = async (client: Client) => {
    const result: Record<string, string> = {};
    const tables = (await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    for (const { tablename } of tables) {
      assert(/^[a-z_][a-z0-9_]*$/.test(tablename));
      const records = (await client.query('SELECT row_to_json(t)::text AS value FROM "' + tablename + '" t')).rows.map(row => row.value as string).sort();
      result[tablename] = createHash('sha256').update(JSON.stringify(records)).digest('hex');
    }
    return result;
  };
  try {
    assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount, 0);
    await owner.query('CREATE DATABASE "' + name + '" OWNER ootla'); owned = true;
    await source.connect(); sourceConnected = true;
    const before = await fingerprint(source);
    await run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', dump], sourceUrl);
    assert((await readFile(dump)).byteLength > 0);
    await run('pg_restore', ['--exit-on-error', '--no-owner', '--no-privileges', '--dbname', name, dump], targetUrl);
    await target.connect(); targetConnected = true;
    assert.deepEqual(await fingerprint(target), before, 'Every restored table, including audit events and uploaded bytes, must match.');
    assert.deepEqual(await fingerprint(source), before, 'Backup verification must leave the source fixture unchanged.');
    console.log('PASS PostgreSQL custom backup restores all table data into a separate owned database without modifying the source');
  } finally {
    if (sourceConnected) await source.end();
    if (targetConnected) await target.end();
    if (owned) {
      await verifyCluster();
      assert(/^ootla_demo_restore_[a-f0-9]{32}$/.test(name));
      assert.equal((await owner.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1', [name])).rows[0]?.owner, 'ootla');
      await owner.query('DROP DATABASE "' + name + '"');
    }
    await unlink(dump).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(directory);
  }
}
