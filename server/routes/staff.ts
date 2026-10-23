import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { membershipUpdateSchema, paginationSchema, propertyInputSchema, type AuthUser, type OrganizationRole, type Permission, type PropertyRecord, type RoleDefinition, type StaffMembership } from '../../shared/contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { protectOrigin } from '../middleware/security.js';
import { assertFieldOwnership, assertLocalCreateAllowed } from '../services/property-foundation.js';

type PropertyRow = { id: string; organization_id: string; name: string; created_at: Date; updated_at: Date };
type MembershipRow = { id: string; user_id: string; organization_id: string; name: string; email: string; role: OrganizationRole; active: boolean; user_active: boolean };
const propertyColumns = 'p.id, p.organization_id, p.name, p.created_at, p.updated_at';
const membershipColumns = 'm.id, m.user_id, m.organization_id, u.display_name AS name, u.email, m.role, m.active, u.active AS user_active';
const propertyRecord = (row: PropertyRow): PropertyRecord => ({ id: row.id, organizationId: row.organization_id, name: row.name, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() });
const membershipRecord = (row: MembershipRow): StaffMembership => ({ id: row.id, userId: row.user_id, organizationId: row.organization_id, name: row.name, email: row.email, role: row.role, active: row.active, userActive: row.user_active });
function uuid(value: unknown): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new ApiError(400, 'INVALID_INPUT', 'Use a valid record identifier.');
  return parsed.data;
}
function actor(response: Response): AuthUser { return response.locals.user as AuthUser; }
function scope(request: Request, user: AuthUser): void {
  if (uuid(request.params.organizationId) !== user.organization.id) throw new ApiError(403, 'ORGANIZATION_DENIED', 'You do not have access to this organization.');
}
function requirePermission(permission: Permission): RequestHandler {
  return (_request, response, next) => {
    if (!actor(response).permissions.includes(permission)) throw new ApiError(403, 'PERMISSION_DENIED', 'Your staff role does not allow this action.');
    next();
  };
}
function body<T>(request: Request, schema: z.ZodType<T>): T {
  if (!request.is('application/json')) throw new ApiError(415, 'JSON_REQUIRED', 'Send this request as application/json.');
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, 'INVALID_INPUT', 'Check the requested fields and try again.');
  return parsed.data;
}
function pagination(request: Request) {
  const parsed = paginationSchema.safeParse(request.query);
  if (!parsed.success) throw new ApiError(400, 'INVALID_INPUT', 'Use a limit from 1 to 200 and a valid offset.');
  return parsed.data;
}
async function authorize(client: PoolClient, user: AuthUser, permission: Permission): Promise<OrganizationRole> {
  // Lock the live actor membership for each write so demotions/deactivation cannot
  // race the permission check. No authority is taken from a request body.
  const result = await client.query<{ role: OrganizationRole }>(`
    SELECT m.role FROM organization_memberships m
    JOIN users u ON u.id = m.user_id AND u.active = TRUE AND u.account_kind = 'staff'
    WHERE m.id = $1 AND m.organization_id = $2 AND m.user_id = $3 AND m.active = TRUE
      AND EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_key = m.role AND rp.permission = $4)
    FOR SHARE OF m, u
  `, [user.membershipId, user.organization.id, user.id, permission]);
  if (!result.rows[0]) throw new ApiError(403, 'PERMISSION_DENIED', 'Your current staff role does not allow this action.');
  return result.rows[0].role;
}
async function audit(client: PoolClient, user: AuthUser, action: string, metadata: Record<string, unknown>): Promise<void> {
  await client.query('INSERT INTO audit_events (organization_id, actor_user_id, action, metadata) VALUES ($1, $2, $3, $4)', [user.organization.id, user.id, action, JSON.stringify(metadata)]);
}
async function lockedProperty(client: PoolClient, user: AuthUser, propertyId: string, role: OrganizationRole): Promise<PropertyRow> {
  const result = await client.query<PropertyRow>(`SELECT ${propertyColumns} FROM properties p WHERE p.id = $1 AND p.organization_id = $2 FOR UPDATE`, [propertyId, user.organization.id]);
  const property = result.rows[0];
  if (!property) throw new ApiError(404, 'PROPERTY_NOT_FOUND', 'This property is unavailable or outside your assigned access.');
  if (role !== 'organization_admin') {
    const assignment = await client.query(`SELECT property_id FROM property_access_assignments WHERE organization_id = $1 AND membership_id = $2 AND property_id = $3 FOR SHARE`, [user.organization.id, user.membershipId, propertyId]);
    if (!assignment.rowCount) throw new ApiError(404, 'PROPERTY_NOT_FOUND', 'This property is unavailable or outside your assigned access.');
  }
  return property;
}
async function staffTarget(client: PoolClient, user: AuthUser, userId: string, requireActive = true): Promise<MembershipRow> {
  const target = await client.query<MembershipRow>(`
    SELECT ${membershipColumns} FROM organization_memberships m
    JOIN users u ON u.id = m.user_id AND u.account_kind = 'staff'
    WHERE m.organization_id = $1 AND m.user_id = $2
      AND (NOT $3::boolean OR (m.active = TRUE AND u.active = TRUE)) FOR SHARE OF m, u
  `, [user.organization.id, userId, requireActive]);
  if (!target.rows[0]) throw new ApiError(404, 'MEMBERSHIP_NOT_FOUND', requireActive ? 'An active staff membership was not found in your organization.' : 'A staff membership was not found in your organization.');
  return target.rows[0];
}

/** Stage 02 authorization registry only. No leasing, accounting or portal workflow. */
export function createStaffRouter(config: ServerConfig, database: Database, requireUser: RequestHandler): Router {
  const router = Router();

  router.get('/roles', requireUser, requirePermission('organization.read'), async (_request, response) => {
    const result = await database.query<RoleDefinition>(`
      SELECT r.key, r.name, r.legacy,
        ARRAY(SELECT rp.permission FROM role_permissions rp WHERE rp.role_key = r.key ORDER BY rp.permission) AS permissions
      FROM roles r ORDER BY r.legacy, r.key
    `);
    response.json({ roles: result.rows });
  });
  router.get('/organizations/:organizationId/memberships', requireUser, requirePermission('memberships.read'), async (request, response) => {
    const user = actor(response); scope(request, user);
    const { limit, offset } = pagination(request);
    const result = await database.query<MembershipRow>(`
      SELECT ${membershipColumns} FROM organization_memberships m
      JOIN users u ON u.id = m.user_id AND u.account_kind = 'staff'
      WHERE m.organization_id = $1 ORDER BY m.created_at, m.id LIMIT $2 OFFSET $3
    `, [user.organization.id, limit, offset]);
    response.json({ memberships: result.rows.map(membershipRecord) });
  });
  router.patch('/organizations/:organizationId/memberships/:userId', protectOrigin(config), requireUser, requirePermission('memberships.manage'), async (request, response) => {
    const user = actor(response); scope(request, user);
    const userId = uuid(request.params.userId);
    const input = body(request, membershipUpdateSchema);
    const updated = await database.transaction(async (client) => {
      // Serialize membership edits in this organization, including concurrent
      // last-admin changes, before locking the actor/target memberships. A non-key
      // row lock remains compatible with unrelated organization foreign-key checks.
      await client.query('SELECT id FROM organizations WHERE id = $1 FOR NO KEY UPDATE', [user.organization.id]);
      await authorize(client, user, 'memberships.manage');
      const target = (await client.query<MembershipRow>(`
        SELECT ${membershipColumns} FROM organization_memberships m
        JOIN users u ON u.id = m.user_id AND u.account_kind = 'staff'
        WHERE m.organization_id = $1 AND m.user_id = $2 FOR UPDATE OF m
      `, [user.organization.id, userId])).rows[0];
      if (!target) throw new ApiError(404, 'MEMBERSHIP_NOT_FOUND', 'A staff membership was not found in your organization.');
      const role = input.role ?? target.role;
      const active = input.active ?? target.active;
      if (target.role === 'organization_admin' && target.active && target.user_active && (role !== 'organization_admin' || !active)) {
        const admins = await client.query<{ count: string }>(`
          SELECT count(*) FROM organization_memberships m JOIN users u ON u.id = m.user_id AND u.active = TRUE AND u.account_kind = 'staff'
          WHERE m.organization_id = $1 AND m.active = TRUE AND m.role = 'organization_admin'
        `, [user.organization.id]);
        if (Number(admins.rows[0]?.count) <= 1) throw new ApiError(409, 'LAST_ORGANIZATION_ADMIN', 'Keep at least one active organization admin.');
      }
      const changed = role !== target.role || active !== target.active;
      if (changed) {
        await client.query('UPDATE organization_memberships SET role = $1, active = $2, updated_at = now() WHERE id = $3 AND organization_id = $4', [role, active, target.id, user.organization.id]);
        if (!active) await client.query('DELETE FROM sessions WHERE user_id = $1 AND organization_id = $2', [userId, user.organization.id]);
        await audit(client, user, 'membership.updated', { targetUserId: userId, membershipId: target.id, previousRole: target.role, role, previousActive: target.active, active });
      }
      return membershipRecord({ ...target, role, active });
    });
    response.json({ membership: updated });
  });
  router.get('/properties', requireUser, requirePermission('properties.read'), async (request, response) => {
    const user = actor(response);
    const { limit, offset } = pagination(request);
    const result = await database.query<PropertyRow>(`
      SELECT ${propertyColumns} FROM properties p WHERE p.organization_id = $1
      AND ($2 = 'organization_admin' OR EXISTS (SELECT 1 FROM property_access_assignments a WHERE a.organization_id = p.organization_id AND a.property_id = p.id AND a.membership_id = $3))
      ORDER BY p.name, p.id LIMIT $4 OFFSET $5
    `, [user.organization.id, user.organization.role, user.membershipId, limit, offset]);
    response.json({ properties: result.rows.map(propertyRecord) });
  });
  router.get('/properties/:propertyId', requireUser, requirePermission('properties.read'), async (request, response) => {
    const user = actor(response); const propertyId = uuid(request.params.propertyId);
    const result = await database.query<PropertyRow>(`
      SELECT ${propertyColumns} FROM properties p WHERE p.id = $1 AND p.organization_id = $2
      AND ($3 = 'organization_admin' OR EXISTS (SELECT 1 FROM property_access_assignments a WHERE a.organization_id = p.organization_id AND a.property_id = p.id AND a.membership_id = $4))
    `, [propertyId, user.organization.id, user.organization.role, user.membershipId]);
    if (!result.rows[0]) throw new ApiError(404, 'PROPERTY_NOT_FOUND', 'This property is unavailable or outside your assigned access.');
    response.json({ property: propertyRecord(result.rows[0]) });
  });
  router.post('/properties', protectOrigin(config), requireUser, requirePermission('property_access.manage'), async (request, response) => {
    const user = actor(response); const input = body(request, propertyInputSchema);
    const property = await database.transaction(async (client) => {
      await authorize(client, user, 'property_access.manage');
      await assertLocalCreateAllowed(client, user, 'property');
      const result = await client.query<PropertyRow>('INSERT INTO properties (organization_id, name) VALUES ($1, $2) RETURNING *', [user.organization.id, input.name]);
      const created = result.rows[0]!;
      await audit(client, user, 'property.created', { propertyId: created.id });
      return propertyRecord(created);
    });
    response.status(201).json({ property });
  });
  router.patch('/properties/:propertyId', protectOrigin(config), requireUser, requirePermission('properties.manage'), async (request, response) => {
    const user = actor(response); const propertyId = uuid(request.params.propertyId); const input = body(request, propertyInputSchema);
    const property = await database.transaction(async (client) => {
      const role = await authorize(client, user, 'properties.manage');
      const previous = await lockedProperty(client, user, propertyId, role);
      await assertFieldOwnership(client, user, 'property', propertyId, ['name']);
      if (previous.name === input.name) return propertyRecord(previous);
      const result = await client.query<PropertyRow>('UPDATE properties SET name = $1, updated_at = now() WHERE id = $2 AND organization_id = $3 RETURNING *', [input.name, propertyId, user.organization.id]);
      await audit(client, user, 'property.updated', { propertyId, fields: ['name'] });
      return propertyRecord(result.rows[0]!);
    });
    response.json({ property });
  });
  router.put('/properties/:propertyId/access/:userId', protectOrigin(config), requireUser, requirePermission('property_access.manage'), async (request, response) => {
    const user = actor(response); const propertyId = uuid(request.params.propertyId); const userId = uuid(request.params.userId);
    if (request.body !== undefined && (!request.is('application/json') || !z.object({}).strict().safeParse(request.body).success)) throw new ApiError(400, 'INVALID_INPUT', 'Property access is defined by the URL; do not submit extra fields.');
    const assignment = await database.transaction(async (client) => {
      const role = await authorize(client, user, 'property_access.manage');
      await lockedProperty(client, user, propertyId, role);
      const target = await staffTarget(client, user, userId);
      const inserted = await client.query<{ created_at: Date }>(`
        INSERT INTO property_access_assignments (organization_id, membership_id, property_id, assigned_by_user_id)
        VALUES ($1, $2, $3, $4) ON CONFLICT (organization_id, membership_id, property_id) DO NOTHING RETURNING created_at
      `, [user.organization.id, target.id, propertyId, user.id]);
      if (inserted.rowCount) await audit(client, user, 'property_access.granted', { propertyId, membershipId: target.id, targetUserId: userId });
      const assigned = inserted.rows[0] ?? (await client.query<{ created_at: Date }>('SELECT created_at FROM property_access_assignments WHERE organization_id = $1 AND membership_id = $2 AND property_id = $3', [user.organization.id, target.id, propertyId])).rows[0]!;
      return { organizationId: user.organization.id, membershipId: target.id, propertyId, assignedAt: assigned.created_at.toISOString() };
    });
    response.json({ assignment });
  });
  router.delete('/properties/:propertyId/access/:userId', protectOrigin(config), requireUser, requirePermission('property_access.manage'), async (request, response) => {
    const user = actor(response); const propertyId = uuid(request.params.propertyId); const userId = uuid(request.params.userId);
    await database.transaction(async (client) => {
      const role = await authorize(client, user, 'property_access.manage');
      await lockedProperty(client, user, propertyId, role);
      const target = await staffTarget(client, user, userId, false);
      const removed = await client.query('DELETE FROM property_access_assignments WHERE organization_id = $1 AND membership_id = $2 AND property_id = $3', [user.organization.id, target.id, propertyId]);
      if (removed.rowCount) await audit(client, user, 'property_access.revoked', { propertyId, membershipId: target.id, targetUserId: userId });
    });
    response.status(204).end();
  });
  router.get('/audit-events', requireUser, requirePermission('audit.read'), async (request, response) => {
    const user = actor(response); const { limit, offset } = pagination(request);
    const result = await database.query<{ id: string; action: string; actor_user_id: string | null; metadata: Record<string, unknown>; created_at: Date }>(`
      SELECT id::text, action, actor_user_id, metadata, created_at FROM audit_events WHERE organization_id = $1
      ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3
    `, [user.organization.id, limit, offset]);
    response.json({ events: result.rows.map((row) => ({ id: row.id, action: row.action, actorUserId: row.actor_user_id, metadata: row.metadata, createdAt: row.created_at.toISOString() })) });
  });
  return router;
}



