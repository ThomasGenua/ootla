-- Stage 02: additive staff authorization. Existing identities, password hashes,
-- membership roles and sessions are retained. Portal identities are separate.
CREATE TABLE roles (
  key text PRIMARY KEY CHECK (key IN ('organization_admin', 'leasing_agent', 'property_manager', 'read_only_analyst', 'staff', 'read_only')),
  name text NOT NULL,
  legacy boolean NOT NULL DEFAULT false
);
INSERT INTO roles (key, name, legacy) VALUES
 ('organization_admin', 'Organization admin', false),
 ('leasing_agent', 'Leasing agent', false),
 ('property_manager', 'Property manager', false),
 ('read_only_analyst', 'Read-only analyst', false),
 ('staff', 'Staff (legacy leasing access)', true),
 ('read_only', 'Read only (legacy analyst access)', true);
CREATE TABLE role_permissions (
  role_key text NOT NULL REFERENCES roles(key) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN ('organization.read', 'memberships.read', 'memberships.manage', 'property_access.manage', 'audit.read', 'properties.read', 'properties.manage', 'leasing.manage', 'analytics.read')),
  PRIMARY KEY (role_key, permission)
);
INSERT INTO role_permissions (role_key, permission)
 SELECT 'organization_admin', unnest(ARRAY['organization.read', 'memberships.read', 'memberships.manage', 'property_access.manage', 'audit.read', 'properties.read', 'properties.manage', 'leasing.manage', 'analytics.read']);
INSERT INTO role_permissions (role_key, permission)
 SELECT role_key, unnest(ARRAY['organization.read', 'properties.read', 'leasing.manage']) FROM (VALUES ('leasing_agent'), ('staff')) AS role_names(role_key);
INSERT INTO role_permissions (role_key, permission)
 SELECT 'property_manager', unnest(ARRAY['organization.read', 'properties.read', 'properties.manage', 'leasing.manage', 'analytics.read']);
INSERT INTO role_permissions (role_key, permission)
 SELECT role_key, unnest(ARRAY['organization.read', 'properties.read', 'analytics.read']) FROM (VALUES ('read_only_analyst'), ('read_only')) AS role_names(role_key);

ALTER TABLE users ADD COLUMN account_kind text NOT NULL DEFAULT 'staff'
 CHECK (account_kind IN ('staff', 'applicant', 'resident'));
ALTER TABLE users ADD CONSTRAINT users_id_account_kind_key UNIQUE (id, account_kind);
ALTER TABLE organization_memberships DROP CONSTRAINT organization_memberships_role_check;
ALTER TABLE organization_memberships ADD CONSTRAINT organization_memberships_role_fkey FOREIGN KEY (role) REFERENCES roles(key);
ALTER TABLE organization_memberships ADD COLUMN account_kind text NOT NULL DEFAULT 'staff' CHECK (account_kind = 'staff');
ALTER TABLE organization_memberships ADD CONSTRAINT memberships_staff_identity_fkey
 FOREIGN KEY (user_id, account_kind) REFERENCES users(id, account_kind) ON DELETE CASCADE;
ALTER TABLE organization_memberships ADD CONSTRAINT memberships_id_organization_key UNIQUE (id, organization_id);

-- Minimal identity registry required for property authorization, not a property
-- CRM, unit registry, accounting source or Yardi synchronization workflow.
CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);
CREATE INDEX properties_organization_idx ON properties(organization_id, name, id);
CREATE TABLE property_access_assignments (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL,
  property_id uuid NOT NULL,
  assigned_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, membership_id, property_id),
  FOREIGN KEY (membership_id, organization_id) REFERENCES organization_memberships(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX property_access_property_idx ON property_access_assignments(property_id, organization_id);
