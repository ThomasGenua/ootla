import { loadConfig, ConfigurationError } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { ApiError } from '../server/http/errors.js';
import { organizationSetupSchema, provisionOrganization } from '../server/services/provision-organization.js';

const config = loadConfig(), database = new Database(config);
try {
  if (!config.databaseName || process.env.OOTLA_SETUP_DATABASE !== config.databaseName) throw new ConfigurationError('Set OOTLA_SETUP_DATABASE to the exact intended database name before provisioning.');
  const parsed = organizationSetupSchema.safeParse({ name: process.env.OOTLA_ORGANIZATION_NAME,
    slug: process.env.OOTLA_ORGANIZATION_SLUG, adminName: process.env.OOTLA_ADMIN_NAME,
    adminEmail: process.env.OOTLA_ADMIN_EMAIL, password: process.env.OOTLA_ADMIN_PASSWORD });
  if (!parsed.success) throw new ConfigurationError('Supply valid OOTLA_ORGANIZATION_NAME, OOTLA_ORGANIZATION_SLUG, OOTLA_ADMIN_NAME, OOTLA_ADMIN_EMAIL and a 16–128 character OOTLA_ADMIN_PASSWORD through protected environment variables.');
  await provisionOrganization(database, config, parsed.data);
  console.info('Organization and individual administrator created. Sign in normally, then open Getting started. No invitation or email was sent.');
} catch (error) {
  console.error(error instanceof ApiError || error instanceof ConfigurationError ? error.message : 'Organization setup failed. Account data, credentials and raw errors are omitted.');
  process.exitCode = 1;
} finally {
  delete process.env.OOTLA_ADMIN_PASSWORD;
  await database.close();
}
