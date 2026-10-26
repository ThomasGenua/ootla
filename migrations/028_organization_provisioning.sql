-- Operator-only first organization-administrator invitations; no public organization creation.
-- Existing users, passwords, organizations and memberships are untouched.
CREATE TABLE staff_admin_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),user_id uuid NOT NULL REFERENCES users(id),membership_id uuid NOT NULL,
 purpose text NOT NULL DEFAULT 'first_organization_admin' CHECK(purpose='first_organization_admin'),request_key uuid NOT NULL UNIQUE,
 token_digest char(64) NOT NULL UNIQUE,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,accepted_at timestamptz,revoked_at timestamptz,
 source text NOT NULL DEFAULT 'operator_cli' CHECK(source='operator_cli'),
 UNIQUE(id,organization_id),FOREIGN KEY(membership_id,user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '72 hours'),CHECK(accepted_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX staff_admin_invitation_target_idx ON staff_admin_invitations(organization_id,created_at DESC,id);
CREATE UNIQUE INDEX staff_admin_one_pending_invitation ON staff_admin_invitations(organization_id) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE TABLE organization_provisioning_receipts(
 request_key uuid PRIMARY KEY,operation text NOT NULL CHECK(operation IN('provision','reissue','revoke')),payload_hash char(64) NOT NULL,
 organization_id uuid NOT NULL REFERENCES organizations(id),administrator_user_id uuid NOT NULL REFERENCES users(id),invitation_id uuid NOT NULL,
 source text NOT NULL DEFAULT 'operator_cli' CHECK(source='operator_cli'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(invitation_id,organization_id) REFERENCES staff_admin_invitations(id,organization_id)
);
