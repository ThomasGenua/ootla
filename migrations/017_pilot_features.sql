-- Additive pilot features; existing identities and business records are preserved.
CREATE TABLE organization_pilot_settings (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 ai_enabled boolean NOT NULL DEFAULT false,
 updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE assistant_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 lead_id uuid NOT NULL, actor_user_id uuid NOT NULL REFERENCES users(id), request_key uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('summary','follow_up','next_actions')),
 mode text NOT NULL CHECK(mode IN ('demo','live')), status text NOT NULL CHECK(status IN ('pending','completed','failed')),
 result jsonb, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,actor_user_id,request_key),
 FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id)
);
CREATE INDEX assistant_quota_idx ON assistant_requests(organization_id,actor_user_id,created_at DESC);
CREATE TABLE staff_access_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 kind text NOT NULL CHECK(kind IN ('invitation','recovery')),
 token_digest char(64) NOT NULL UNIQUE, email text NOT NULL, display_name text NOT NULL,
 role text NOT NULL REFERENCES roles(key), property_ids uuid[] NOT NULL DEFAULT '{}',
 target_user_id uuid REFERENCES users(id), created_by uuid NOT NULL REFERENCES users(id),
 expires_at timestamptz NOT NULL, consumed_at timestamptz, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(expires_at>created_at)
);
CREATE INDEX staff_access_links_org_idx ON staff_access_links(organization_id,created_at DESC);
