-- Stage22: optional read-only organization GA4 authorization, selection and permission-scoped caches.
CREATE TABLE google_analytics_connections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id),
 owner_user_id uuid NOT NULL REFERENCES users(id),owner_membership_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN('illustrative','live')),state text NOT NULL CHECK(state IN('demo','connecting','connected','degraded','revoked','disconnected')),
 token_envelope jsonb,token_expires_at timestamptz,scopes text[] NOT NULL DEFAULT '{}',
 property_id text,property_name text,time_zone text,crm_property_id uuid,version integer NOT NULL DEFAULT 1,
 last_successful_fetch timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id),FOREIGN KEY(owner_membership_id,owner_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id),
 FOREIGN KEY(crm_property_id,organization_id) REFERENCES properties(id,organization_id)
);
CREATE TABLE google_analytics_oauth_states(
 state_digest char(64) PRIMARY KEY,organization_id uuid NOT NULL REFERENCES organizations(id),user_id uuid NOT NULL REFERENCES users(id),membership_id uuid NOT NULL,
 session_digest char(64) NOT NULL,verifier_envelope jsonb NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(membership_id,user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id)
);
CREATE INDEX google_analytics_oauth_expiry_idx ON google_analytics_oauth_states(expires_at);
CREATE TABLE google_analytics_report_cache(
 cache_key char(64) PRIMARY KEY,organization_id uuid NOT NULL,connection_id uuid NOT NULL,configuration_version integer NOT NULL,
 property_id text NOT NULL,permission_scope char(64) NOT NULL,kind text NOT NULL,date_from date NOT NULL,date_to date NOT NULL,comparison text NOT NULL,page integer NOT NULL,page_size integer NOT NULL,
 payload jsonb NOT NULL,fetched_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 FOREIGN KEY(connection_id,organization_id) REFERENCES google_analytics_connections(id,organization_id)
);
CREATE INDEX google_analytics_cache_expiry_idx ON google_analytics_report_cache(organization_id,connection_id,expires_at);
CREATE TABLE google_analytics_property_pages(
 cursor_digest char(64) PRIMARY KEY,organization_id uuid NOT NULL,connection_id uuid NOT NULL,configuration_version integer NOT NULL,
 actor_user_id uuid NOT NULL REFERENCES users(id),session_digest char(64) NOT NULL,items jsonb NOT NULL,next_google_token text,expires_at timestamptz NOT NULL,
 FOREIGN KEY(connection_id,organization_id) REFERENCES google_analytics_connections(id,organization_id)
);
CREATE INDEX google_analytics_property_page_expiry_idx ON google_analytics_property_pages(expires_at);
CREATE TABLE google_analytics_action_receipts(
 organization_id uuid NOT NULL REFERENCES organizations(id),actor_user_id uuid NOT NULL REFERENCES users(id),request_key uuid NOT NULL,operation text NOT NULL,payload_hash char(64) NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,actor_user_id,request_key)
);

ALTER TABLE google_analytics_property_pages ADD COLUMN purpose text NOT NULL DEFAULT 'properties' CHECK(purpose IN('properties','key_events'));
