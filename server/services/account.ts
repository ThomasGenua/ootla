import type { PoolClient } from 'pg';
import type { AuthUser, OrganizationRole, Permission } from '../../shared/contracts.js';
import {
  defaultAccountPreferences,
  type AccountPasswordUpdate, type AccountPreferences, type AccountPreferencesUpdate,
  type AccountProfile, type AccountProfileUpdate, type AccountSnapshot,
} from '../../shared/account-contracts.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { hashPassword, verifyPassword } from './passwords.js';

type Identity = {
  id: string; email: string; display_name: string; staff_phone: string | null;
  staff_job_title: string | null; profile_version: number; updated_at: Date;
  is_demo: boolean; membership_id: string; organization_id: string;
  organization_name: string; role: OrganizationRole; permissions: Permission[];
};
type PreferenceRow = {
  default_page: AccountPreferences['defaultPage']; lead_view: AccountPreferences['leadView'];
  motion: AccountPreferences['motion']; version: number; updated_at: Date;
};

export class PasswordChangeLimited extends ApiError {
  constructor(readonly retryAfter: number) {
    super(429, 'PASSWORD_LIMITED', 'Too many password-change attempts. Try again after the waiting period.');
  }
}
const profile = (row: Identity): AccountProfile => ({
  id: row.id, membershipId: row.membership_id, displayName: row.display_name,
  email: row.email, phone: row.staff_phone, jobTitle: row.staff_job_title,
  organization: { id: row.organization_id, name: row.organization_name, role: row.role },
  version: row.profile_version, updatedAt: row.updated_at.toISOString(),
});
function preferences(row: PreferenceRow | undefined, user: Identity): AccountPreferences {
  return {
    defaultPage: row?.default_page === '/admin/tasks' && !user.permissions.includes('leasing.manage')
      ? '/admin' : row?.default_page ?? defaultAccountPreferences.defaultPage,
    leadView: row?.lead_view ?? defaultAccountPreferences.leadView,
    motion: row?.motion ?? defaultAccountPreferences.motion,
    version: row?.version ?? 1,
    updatedAt: row?.updated_at.toISOString() ?? null,
  };
}
function conflict(): never {
  throw new ApiError(409, 'VERSION_CONFLICT', 'This information changed in another tab. Reload it before saving again.');
}

/** Self-service only. No API accepts a target user, organization, role or email. */
export class AccountService {
  constructor(private readonly database: Database) {}

  private async identity(client: PoolClient, actor: AuthUser, write: boolean, sessionDigest: string): Promise<Identity> {
    // Serialize self-service writes on the actual user row. Reload the current
    // membership/role rather than trusting the browser or a previous session read.
    // No key changes: allow existing audit/session foreign-key KEY SHARE locks
    // while still serializing account writes and password-verifying logins.
    const identity = await client.query<Identity>(`
      SELECT u.id, u.email, u.display_name, u.staff_phone, u.staff_job_title,
        u.profile_version, u.updated_at, u.is_demo,
        m.id AS membership_id, m.organization_id, m.role, o.name AS organization_name,
        ARRAY(SELECT rp.permission FROM role_permissions rp WHERE rp.role_key=m.role ORDER BY rp.permission) AS permissions
      FROM users u
      JOIN organization_memberships m ON m.user_id=u.id
      JOIN organizations o ON o.id=m.organization_id
      WHERE u.id=$1 AND m.id=$2 AND m.organization_id=$3
        AND u.active AND u.account_kind='staff' AND m.active AND m.account_kind='staff'
      ${write ? 'FOR NO KEY UPDATE OF u FOR SHARE OF m' : 'FOR SHARE OF u, m'}
    `, [actor.id, actor.membershipId, actor.organization.id]);
    if (!identity.rows[0]) throw new ApiError(403, 'ACCOUNT_UNAVAILABLE', 'Your active staff account is unavailable. Sign in again.');
    // A request can authenticate, then wait for this user lock while another
    // request revokes its cookie. Recheck that exact session after the wait;
    // the share lock also prevents concurrent logout from racing this write.
    const session = await client.query(`
      SELECT id FROM sessions WHERE token_digest=$1 AND user_id=$2
        AND organization_id=$3 AND expires_at>clock_timestamp() FOR SHARE
    `,[sessionDigest,actor.id,actor.organization.id]);
    if (!session.rowCount) throw new ApiError(401,'AUTH_REQUIRED','Your session ended. Sign in again.');
    return identity.rows[0];
  }

  private async preferenceRow(client: PoolClient, user: Identity): Promise<PreferenceRow | undefined> {
    const result = await client.query<PreferenceRow>(`
      SELECT default_page, lead_view, motion, version, updated_at
      FROM staff_user_preferences
      WHERE user_id=$1 AND organization_id=$2 AND membership_id=$3
    `, [user.id, user.organization_id, user.membership_id]);
    return result.rows[0];
  }

  private async audit(client: PoolClient, user: Identity, action: string, fields: string[] = []): Promise<void> {
    await client.query(`
      INSERT INTO audit_events (organization_id, actor_user_id, action, metadata)
      VALUES ($1,$2,$3,$4::jsonb)
    `, [user.organization_id, user.id, action, JSON.stringify({ fields })]);
  }

  async current(actor: AuthUser, sessionDigest: string): Promise<AccountSnapshot> {
    return this.database.transaction(async client => {
      const user = await this.identity(client, actor, false, sessionDigest);
      return {
        profile: profile(user),
        preferences: preferences(await this.preferenceRow(client, user), user),
        access: {
          canChangePassword: !user.is_demo,
          passwordChangeNotice: user.is_demo
            ? 'This is a shared demo account. Its sign-in password is kept unchanged so everyone can explore the demo.'
            : null,
        },
      };
    });
  }

  async updateProfile(actor: AuthUser, input: AccountProfileUpdate, sessionDigest: string): Promise<AccountProfile> {
    return this.database.transaction(async client => {
      const user = await this.identity(client, actor, true, sessionDigest);
      if (user.profile_version !== input.version) conflict();
      const fields = [
        user.display_name !== input.displayName ? 'displayName' : null,
        user.staff_phone !== input.phone ? 'phone' : null,
        user.staff_job_title !== input.jobTitle ? 'jobTitle' : null,
      ].filter((value): value is string => value !== null);
      const result = await client.query<Pick<Identity, 'display_name' | 'staff_phone' | 'staff_job_title' | 'profile_version' | 'updated_at'>>(`
        UPDATE users SET display_name=$2, staff_phone=$3, staff_job_title=$4,
          profile_version=profile_version+1, updated_at=now()
        WHERE id=$1
        RETURNING display_name,staff_phone,staff_job_title,profile_version,updated_at
      `, [user.id, input.displayName, input.phone, input.jobTitle]);
      await this.audit(client, user, 'account.profile_updated', fields);
      return profile({ ...user, ...result.rows[0] });
    });
  }

  async updatePreferences(actor: AuthUser, input: AccountPreferencesUpdate, sessionDigest: string): Promise<AccountPreferences> {
    return this.database.transaction(async client => {
      const user = await this.identity(client, actor, true, sessionDigest);
      const previous = await this.preferenceRow(client, user);
      if ((previous?.version ?? 1) !== input.version) conflict();
      if (input.defaultPage === '/admin/tasks' && !user.permissions.includes('leasing.manage')) {
        throw new ApiError(403, 'PREFERENCE_DENIED', 'Your current staff role does not have access to the Tasks workspace.');
      }
      const result = await client.query<PreferenceRow>(`
        INSERT INTO staff_user_preferences
          (user_id,organization_id,membership_id,default_page,lead_view,motion,version)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (user_id,organization_id) DO UPDATE SET
          default_page=EXCLUDED.default_page,lead_view=EXCLUDED.lead_view,
          motion=EXCLUDED.motion,version=EXCLUDED.version,updated_at=now()
        RETURNING default_page,lead_view,motion,version,updated_at
      `, [user.id,user.organization_id,user.membership_id,input.defaultPage,input.leadView,input.motion,input.version+1]);
      const fields = [
        (previous?.default_page ?? defaultAccountPreferences.defaultPage) !== input.defaultPage ? 'defaultPage' : null,
        (previous?.lead_view ?? defaultAccountPreferences.leadView) !== input.leadView ? 'leadView' : null,
        (previous?.motion ?? defaultAccountPreferences.motion) !== input.motion ? 'motion' : null,
      ].filter((value): value is string => value !== null);
      await this.audit(client,user,'account.preferences_updated',fields);
      return preferences(result.rows[0], user);
    });
  }

  async changePassword(actor: AuthUser, input: AccountPasswordUpdate, sessionDigest: string): Promise<void> {
    const outcome = await this.database.transaction(async client => {
      const user = await this.identity(client, actor, true, sessionDigest);
      if (user.is_demo) throw new ApiError(403, 'DEMO_PASSWORD_LOCKED', 'Shared demo passwords cannot be changed.');
      // The user lock serializes attempts across all sessions/API instances. Keep
      // failed-attempt updates committed before returning the credential error.
      const attempt = await client.query<{ attempts: number }>(`
        INSERT INTO staff_password_attempt_limits (user_id,window_started_at,attempts)
        VALUES ($1,clock_timestamp(),1)
        ON CONFLICT(user_id) DO UPDATE SET
          attempts=CASE WHEN staff_password_attempt_limits.window_started_at <= clock_timestamp()-interval '15 minutes'
            THEN 1 ELSE staff_password_attempt_limits.attempts+1 END,
          window_started_at=CASE WHEN staff_password_attempt_limits.window_started_at <= clock_timestamp()-interval '15 minutes'
            THEN clock_timestamp() ELSE staff_password_attempt_limits.window_started_at END
        WHERE staff_password_attempt_limits.attempts<5
          OR staff_password_attempt_limits.window_started_at <= clock_timestamp()-interval '15 minutes'
        RETURNING attempts
      `,[user.id]);
      if (!attempt.rows[0]) {
        const limit = await client.query<{ retry_after: number }>(`
          SELECT greatest(1,ceil(extract(epoch FROM window_started_at+interval '15 minutes'-clock_timestamp())))::integer AS retry_after
          FROM staff_password_attempt_limits WHERE user_id=$1
        `,[user.id]);
        throw new PasswordChangeLimited(limit.rows[0]?.retry_after ?? 900);
      }
      const stored = await client.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=$1',[user.id]);
      if (!await verifyPassword(stored.rows[0].password_hash,input.currentPassword)) return 'incorrect' as const;
      const passwordHash = await hashPassword(input.newPassword);
      await client.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',[user.id,passwordHash]);
      // Includes the requesting session and sessions in other organizations.
      // Concurrent login revalidates this same locked password hash before it
      // inserts a session, so an old password cannot create a surviving session.
      await client.query('DELETE FROM sessions WHERE user_id=$1',[user.id]);
      await this.audit(client,user,'account.password_changed');
      return 'changed' as const;
    });
    if (outcome === 'incorrect') throw new ApiError(400,'CURRENT_PASSWORD_INCORRECT','The current password is incorrect.');
  }
}
