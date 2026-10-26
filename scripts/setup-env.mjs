import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) {
  console.log('.env already exists; preserved without changes.');
} else {
  const databasePassword = randomBytes(24).toString('hex');
  const sessionSecret = randomBytes(48).toString('hex');
  writeFileSync(envPath, [
    'NODE_ENV=development',
    `DATABASE_URL=postgresql://ootla:${databasePassword}@127.0.0.1:55439/ootla_demo`,
    'PORT=3100',
    'APP_URL=http://127.0.0.1:7673',
    `SESSION_SECRET=${sessionSecret}`,
    'DEMO_MODE=true',
    'INTEGRATIONS_MODE=simulation',
    'OUTBOUND_MODE=simulation',
    'DEMO_ADMIN_EMAIL=admin@demo.ootla.test',
    'DEMO_ADMIN_PASSWORD=OotlaDemo!2026',
    '',
  ].join('\n'), { mode: 0o600, flag: 'wx' });
  console.log('Created ignored .env with random local database/session secrets. No values printed.');
}
