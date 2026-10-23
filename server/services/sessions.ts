import { createHmac, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import type { AuthUser, OrganizationRole, Permission } from '../../shared/contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { isIsolatedDemo } from './demo-environment.js';

const COOKIE_NAME = 'ootla.sid';
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

function sessionToken(request: Request): string | null {
  const value = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
function tokenDigest(token: string, config: ServerConfig): string {
  return createHmac('sha256', config.sessionSecret).update(token).digest('hex');
}
/** Reuse the opaque-cookie codec for transactional session revalidation. */
export function readSessionDigest(request: Request, config: ServerConfig): string | null {
  const token = sessionToken(request);
  return token ? tokenDigest(token, config) : null;
}
type UserRow = {
  id: string; email: string; name: string; organization_id: string;
  environment: 'live' | 'demo'; is_demo: boolean; organization_name: string; membership_id: string; role: OrganizationRole; permissions: Permission[]; session_expires_at?: Date;
};
type LoginRow = UserRow & { password_hash: string };
const userColumns = `u.id, u.email, u.display_name AS name, o.id AS organization_id,
  o.name AS organization_name, o.environment, u.is_demo, m.id AS membership_id, m.role,
  ARRAY(SELECT rp.permission FROM role_permissions rp WHERE rp.role_key = m.role ORDER BY rp.permission) AS permissions`;
function toAuthUser(row: UserRow, expiresAt: Date = row.session_expires_at!): AuthUser {
  return {
    id: row.id, email: row.email, name: row.name, membershipId: row.membership_id,
    permissions: row.permissions, sessionExpiresAt: expiresAt.toISOString(),
    organization: { id: row.organization_id, name: row.organization_name, role: row.role },
  };
}

export class SessionService {
  private readonly dummyHash: Promise<string>;
  constructor(private readonly database: Database, private readonly config: ServerConfig) {
    this.dummyHash = hashPassword(randomBytes(32).toString('hex'));
  }
  private digest(token: string): string {
    return tokenDigest(token, this.config);
  }
  private token(request: Request): string | null {
    return sessionToken(request);
  }
  private cookieOptions() {
    return { httpOnly: true, sameSite: 'lax' as const, secure: this.config.production, path: '/' };
  }
  private async eligible(row: UserRow, connection: Database | PoolClient = this.database): Promise<boolean> {
    // A mistaken DEMO_MODE switch on a mixed/customer database fails closed for all staff.
    const isolated = this.config.demoMode && await isIsolatedDemo(this.config, connection);
    if (this.config.demoMode && !isolated) return false;
    const demoIdentity = row.is_demo || row.environment === 'demo' || row.email === this.config.demoAdminEmail || row.email === 'admin@demo.ootla.test';
    if (demoIdentity) return isolated && row.environment === 'demo';
    return row.environment === 'live';
  }
  async currentUser(request: Request): Promise<AuthUser | null> {
    const token = this.token(request);
    if (!token) return null;
    await this.database.requireReady();
    // Re-read staff identity, active membership, role and grants on every request.
    // Portal accounts and browser-supplied roles never grant workspace access.
    const result = await this.database.query<UserRow>(`
      SELECT ${userColumns}, s.expires_at AS session_expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id AND u.active = TRUE AND u.account_kind = 'staff'
      JOIN organizations o ON o.id = s.organization_id
      JOIN organization_memberships m ON m.user_id = u.id
        AND m.organization_id = o.id AND m.active = TRUE AND m.account_kind = 'staff'
      JOIN roles r ON r.key = m.role
      WHERE s.token_digest = $1 AND s.expires_at > NOW()
      LIMIT 1
    `, [this.digest(token)]);
    const user = result.rows[0];
    return user && await this.eligible(user) ? toAuthUser(user) : null;
  }
  async login(request: Request, response: Response, email: string, password: string): Promise<AuthUser> {
    await this.database.requireReady();
    const result = await this.database.query<LoginRow>(`
      SELECT ${userColumns}, u.password_hash
      FROM users u
      JOIN organization_memberships m ON m.user_id = u.id AND m.active = TRUE AND m.account_kind = 'staff'
      JOIN organizations o ON o.id = m.organization_id
      JOIN roles r ON r.key = m.role
      WHERE u.email = $1 AND u.active = TRUE AND u.account_kind = 'staff'
      ORDER BY m.created_at ASC, m.organization_id ASC LIMIT 1
    `, [email]);
    const row = result.rows[0];
    const validPassword = await verifyPassword(row?.password_hash ?? await this.dummyHash, password);
    if (!row || !validPassword || !await this.eligible(row)) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
    }
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    const previousToken = this.token(request);
    const authenticatedUser = await this.database.transaction(async (client) => {
      const membership = await client.query<LoginRow>(`
        SELECT ${userColumns}, u.password_hash
        FROM organization_memberships m
        JOIN users u ON u.id = m.user_id AND u.active = TRUE AND u.account_kind = 'staff'
        JOIN organizations o ON o.id = m.organization_id
        JOIN roles r ON r.key = m.role
        WHERE m.user_id = $1 AND m.organization_id = $2 AND m.active = TRUE AND m.account_kind = 'staff'
        FOR SHARE OF m, u
      `, [row.id, row.organization_id]);
      const currentUser = membership.rows[0];
      if (!currentUser || currentUser.password_hash !== row.password_hash || !await this.eligible(currentUser, client)) throw new ApiError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
      if (previousToken) await client.query('DELETE FROM sessions WHERE token_digest = $1', [this.digest(previousToken)]);
      await client.query('DELETE FROM sessions WHERE expires_at <= NOW()');
      await client.query(`INSERT INTO sessions (token_digest, user_id, organization_id, expires_at) VALUES ($1, $2, $3, $4)`, [this.digest(token), row.id, row.organization_id, expiresAt]);
      await client.query(`INSERT INTO audit_events (organization_id, actor_user_id, action) VALUES ($1, $2, 'auth.login')`, [row.organization_id, row.id]);
      return toAuthUser(currentUser, expiresAt);
    });
    response.cookie(COOKIE_NAME, token, { ...this.cookieOptions(), maxAge: SESSION_LIFETIME_MS });
    return authenticatedUser;
  }
  async logout(request: Request, response: Response): Promise<void> {
    const token = this.token(request);
    if (token) {
      await this.database.transaction(async (client) => {
        const result = await client.query<{ user_id: string; organization_id: string }>('DELETE FROM sessions WHERE token_digest = $1 RETURNING user_id, organization_id', [this.digest(token)]);
        const session = result.rows[0];
        if (session) await client.query(`INSERT INTO audit_events (organization_id, actor_user_id, action) VALUES ($1, $2, 'auth.logout')`, [session.organization_id, session.user_id]);
      });
    }
    response.clearCookie(COOKIE_NAME, this.cookieOptions());
  }
}

