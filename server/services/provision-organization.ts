import { z } from 'zod';
import type { Database } from '../db/pool.js';
import { assertOotlaDatabase, type ServerConfig } from '../config/env.js';
import { ApiError } from '../http/errors.js';
import { hashPassword } from './passwords.js';

export const organizationSetupSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
  adminName: z.string().trim().min(1).max(200),
  adminEmail: z.email().trim().toLowerCase().max(254),
  password: z.string().min(16).max(128),
}).strict();

// Operator-only service: intentionally has no public signup route. Never adopts
// an existing email, changes a password, or grants access to an existing tenant.
export async function provisionOrganization(database: Database, config: ServerConfig, input: z.infer<typeof organizationSetupSchema>) {
  assertOotlaDatabase(config);
  if (config.demoMode) throw new ApiError(409, 'DEMO_DISABLED', 'Organization provisioning requires DEMO_MODE=false.');
  const values = organizationSetupSchema.parse(input);
  if (values.adminEmail.endsWith('@demo.ootla.test')) throw new ApiError(400, 'INDIVIDUAL_ACCOUNT_REQUIRED', 'Use an individual staff email.');
  await database.requireReady();
  const passwordHash = await hashPassword(values.password);
  return database.transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [6856202]);
    if ((await client.query('SELECT current_database() AS name')).rows[0].name !== config.databaseName) throw new ApiError(409, 'DATABASE_MISMATCH', 'The configured database identity does not match.');
    if ((await client.query('SELECT 1 FROM organizations WHERE slug=$1', [values.slug])).rowCount ||
        (await client.query('SELECT 1 FROM users WHERE email=$1', [values.adminEmail])).rowCount) throw new ApiError(409, 'SETUP_EXISTS', 'That organization slug or email already exists. No account was changed.');
    const organization = (await client.query("INSERT INTO organizations(name,slug,environment) VALUES($1,$2,'live') RETURNING id", [values.name, values.slug])).rows[0];
    const user = (await client.query("INSERT INTO users(email,display_name,password_hash,account_kind) VALUES($1,$2,$3,'staff') RETURNING id", [values.adminEmail, values.adminName, passwordHash])).rows[0];
    await client.query("INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'organization_admin')", [organization.id, user.id]);
    await client.query("INSERT INTO organization_data_settings(organization_id,mode) VALUES($1,'standalone')", [organization.id]);
    await client.query("INSERT INTO audit_events(organization_id,actor_user_id,action) VALUES($1,$2,'organization.provisioned')", [organization.id, user.id]);
    return { organizationId: organization.id as string, userId: user.id as string };
  });
}
