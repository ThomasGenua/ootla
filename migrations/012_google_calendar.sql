-- Stage 14: optional Google Calendar. No credentials, selections or jobs are seeded.
CREATE TABLE google_calendar_connections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,membership_id uuid NOT NULL,user_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('connecting','connected','degraded','revoked','disconnected')),
 token_envelope jsonb,token_expires_at timestamptz,scopes text[] NOT NULL DEFAULT '{}',
 last_successful_sync timestamptz,last_error text,version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,membership_id),UNIQUE(id,organization_id),
 FOREIGN KEY(membership_id,user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE google_calendar_oauth_states(
 state_digest char(64) PRIMARY KEY,organization_id uuid NOT NULL,membership_id uuid NOT NULL,user_id uuid NOT NULL,
 session_digest char(64) NOT NULL,verifier_envelope jsonb NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(membership_id,user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX google_oauth_expiry_idx ON google_calendar_oauth_states(expires_at);
CREATE TABLE google_calendar_selections(
 connection_id uuid NOT NULL,organization_id uuid NOT NULL,calendar_id text NOT NULL,
 display_name text NOT NULL,time_zone text NOT NULL,access_role text NOT NULL,write_target boolean NOT NULL DEFAULT false,
 sync_token text,page_token text,sync_base_token text,sync_generation uuid,initial_sync boolean NOT NULL DEFAULT true,
 coverage_from timestamptz,coverage_until timestamptz,next_full_sync_at timestamptz,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','syncing','synced','failed')),
 last_successful_sync timestamptz,last_error text,
 PRIMARY KEY(connection_id,calendar_id),FOREIGN KEY(connection_id,organization_id) REFERENCES google_calendar_connections(id,organization_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX google_one_write_target_idx ON google_calendar_selections(connection_id) WHERE write_target;
CREATE TABLE google_calendar_event_cache(
 connection_id uuid NOT NULL,organization_id uuid NOT NULL,calendar_id text NOT NULL,event_id text NOT NULL,
 starts_at timestamptz,ends_at timestamptz,all_day boolean NOT NULL DEFAULT false,status text NOT NULL,
 opaque boolean NOT NULL,etag text,owned_viewing_id uuid,
 PRIMARY KEY(connection_id,calendar_id,event_id),
 FOREIGN KEY(connection_id,calendar_id) REFERENCES google_calendar_selections(connection_id,calendar_id) ON DELETE CASCADE,
 FOREIGN KEY(connection_id,organization_id) REFERENCES google_calendar_connections(id,organization_id) ON DELETE CASCADE,
 FOREIGN KEY(owned_viewing_id,organization_id) REFERENCES viewings(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX google_cache_range_idx ON google_calendar_event_cache(connection_id,starts_at,ends_at);
CREATE TABLE google_calendar_sync_stage(
 connection_id uuid NOT NULL,organization_id uuid NOT NULL,calendar_id text NOT NULL,generation uuid NOT NULL,event_id text NOT NULL,
 record jsonb NOT NULL,PRIMARY KEY(connection_id,calendar_id,generation,event_id),
 FOREIGN KEY(connection_id,calendar_id) REFERENCES google_calendar_selections(connection_id,calendar_id) ON DELETE CASCADE,
 FOREIGN KEY(connection_id,organization_id) REFERENCES google_calendar_connections(id,organization_id) ON DELETE CASCADE
);
CREATE TABLE google_calendar_event_mappings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),connection_id uuid NOT NULL,organization_id uuid NOT NULL,viewing_id uuid NOT NULL,
 calendar_id text NOT NULL,event_id text NOT NULL,ownership_proof char(64) NOT NULL,
 remote_etag text,synced_version integer NOT NULL DEFAULT 0,state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','synced','cancelled','failed','conflict')),
 last_successful_sync timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(connection_id,viewing_id),UNIQUE(connection_id,calendar_id,event_id),
 FOREIGN KEY(connection_id,organization_id) REFERENCES google_calendar_connections(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(viewing_id,organization_id) REFERENCES viewings(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE google_calendar_jobs(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,connection_id uuid NOT NULL,organization_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('pull','viewing')),calendar_id text,viewing_id uuid,
 dedupe_key text NOT NULL UNIQUE,state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','retry','succeeded','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),available_at timestamptz NOT NULL DEFAULT now(),
 last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(connection_id,organization_id) REFERENCES google_calendar_connections(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(viewing_id,organization_id) REFERENCES viewings(id,organization_id) ON DELETE RESTRICT,
 CHECK((kind='pull' AND calendar_id IS NOT NULL AND viewing_id IS NULL) OR(kind='viewing' AND viewing_id IS NOT NULL))
);
CREATE INDEX google_jobs_due_idx ON google_calendar_jobs(available_at,id) WHERE state IN ('queued','retry');
