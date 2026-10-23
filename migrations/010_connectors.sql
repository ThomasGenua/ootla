-- Stage 11: isolated connector engine and a synthetic Yardi-style provider.
-- No prior records, source modes, credentials or applied migrations are rewritten.
CREATE TABLE connector_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 provider text NOT NULL CHECK(provider ~ '^[a-z][a-z0-9_-]{0,99}$'),
 state text NOT NULL CHECK(state IN ('not_configured','demo','connecting','live','degraded','disconnected')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), cursor bigint NOT NULL DEFAULT 0 CHECK(cursor>=0),
 credential_envelope jsonb CHECK(credential_envelope IS NULL OR jsonb_typeof(credential_envelope)='object'),
 last_success_at timestamptz,last_attempt_at timestamptz,last_error text,
 created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_by_membership_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id),UNIQUE(organization_id,provider),
 FOREIGN KEY(created_by_membership_id,created_by_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id) ON DELETE RESTRICT,
 CHECK(provider<>'yardi_demo' OR state<>'live')
);
ALTER TABLE external_record_mappings ADD COLUMN connection_id uuid;
ALTER TABLE external_record_mappings ADD COLUMN provider_version integer NOT NULL DEFAULT 0 CHECK(provider_version>=0);
ALTER TABLE external_record_mappings ADD COLUMN provider_snapshot jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(provider_snapshot)='object');
ALTER TABLE external_record_mappings ADD COLUMN last_synced_at timestamptz;
ALTER TABLE external_record_mappings ADD CONSTRAINT external_mapping_connection_tenant_fkey
 FOREIGN KEY(connection_id,organization_id) REFERENCES connector_connections(id,organization_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX external_mapping_connection_identity_key ON external_record_mappings(connection_id,entity_type,external_id) WHERE connection_id IS NOT NULL;

CREATE TABLE connector_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,connection_id uuid NOT NULL,
 request_key uuid NOT NULL,mode text NOT NULL CHECK(mode IN ('incremental','replay')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),processed_count integer NOT NULL DEFAULT 0 CHECK(processed_count>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),error text,upper_sequence bigint NOT NULL CHECK(upper_sequence>=0),
 scan_cursor bigint NOT NULL CHECK(scan_cursor>=0),
 requested_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,requested_by_membership_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 UNIQUE(id,organization_id),UNIQUE(connection_id,request_key),
 FOREIGN KEY(connection_id,organization_id) REFERENCES connector_connections(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(requested_by_membership_id,requested_by_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX connector_jobs_worker_idx ON connector_jobs(status,next_attempt_at,created_at);
CREATE TABLE connector_demo_state (
 connection_id uuid PRIMARY KEY,organization_id uuid NOT NULL,fail_next integer NOT NULL DEFAULT 0 CHECK(fail_next BETWEEN 0 AND 3),
 FOREIGN KEY(connection_id,organization_id) REFERENCES connector_connections(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE connector_demo_records (
 connection_id uuid NOT NULL,organization_id uuid NOT NULL,entity_type text NOT NULL CHECK(entity_type IN ('property','unit','contact','lead')),
 external_id text NOT NULL CHECK(char_length(external_id) BETWEEN 1 AND 200),provider_version integer NOT NULL CHECK(provider_version>0),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id,entity_type,external_id),
 FOREIGN KEY(connection_id,organization_id) REFERENCES connector_connections(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE connector_demo_events (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,connection_id uuid NOT NULL,organization_id uuid NOT NULL,
 provider_event_id uuid NOT NULL,entity_type text NOT NULL CHECK(entity_type IN ('property','unit','contact','lead')),
 external_id text NOT NULL,provider_version integer NOT NULL CHECK(provider_version>0),payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(sequence,organization_id),UNIQUE(sequence,connection_id,organization_id),
 FOREIGN KEY(connection_id,organization_id) REFERENCES connector_connections(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX connector_demo_events_poll_idx ON connector_demo_events(connection_id,sequence);
CREATE TABLE connector_event_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,connection_id uuid NOT NULL,
 provider_event_id uuid NOT NULL,entity_type text NOT NULL CHECK(entity_type IN ('property','unit','contact','lead')),
 external_id text NOT NULL,provider_version integer NOT NULL CHECK(provider_version>0),
 status text NOT NULL CHECK(status IN ('applied','conflict','ignored')),mapping_id uuid NOT NULL,
 first_sequence bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id),UNIQUE(connection_id,provider_event_id),
 FOREIGN KEY(connection_id,organization_id) REFERENCES connector_connections(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(mapping_id,organization_id) REFERENCES external_record_mappings(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(first_sequence,connection_id,organization_id) REFERENCES connector_demo_events(sequence,connection_id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE connector_event_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,connection_id uuid NOT NULL,
 sequence bigint NOT NULL,receipt_id uuid NOT NULL,status text NOT NULL CHECK(status IN ('applied','duplicate','conflict','ignored')),
 summary text NOT NULL CHECK(char_length(summary)<=500),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(connection_id,sequence),
 FOREIGN KEY(connection_id,organization_id) REFERENCES connector_connections(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(receipt_id,organization_id) REFERENCES connector_event_receipts(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(sequence,connection_id,organization_id) REFERENCES connector_demo_events(sequence,connection_id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX connector_event_logs_page_idx ON connector_event_logs(connection_id,created_at DESC,id);
CREATE TABLE connector_conflicts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,connection_id uuid NOT NULL,
 receipt_id uuid NOT NULL UNIQUE,mapping_id uuid NOT NULL,reason text NOT NULL CHECK(reason IN ('local_change','stale_event')),
 fields text[] NOT NULL,current_values jsonb NOT NULL CHECK(jsonb_typeof(current_values)='object'),
 provider_values jsonb NOT NULL CHECK(jsonb_typeof(provider_values)='object'),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 resolution text CHECK(resolution IN ('use_provider','keep_ootla')),
 resolved_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,resolved_by_membership_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,
 UNIQUE(id,organization_id),
 FOREIGN KEY(connection_id,organization_id) REFERENCES connector_connections(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(receipt_id,organization_id) REFERENCES connector_event_receipts(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(mapping_id,organization_id) REFERENCES external_record_mappings(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(resolved_by_membership_id,resolved_by_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id) ON DELETE RESTRICT,
 CHECK((status='open' AND resolution IS NULL AND resolved_at IS NULL) OR (status='resolved' AND resolution IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL AND resolved_by_membership_id IS NOT NULL))
);
CREATE INDEX connector_conflicts_page_idx ON connector_conflicts(connection_id,status,created_at DESC,id);
CREATE TABLE connector_action_receipts (
 connection_id uuid NOT NULL,organization_id uuid NOT NULL,request_key uuid NOT NULL,operation text NOT NULL,
 payload_hash char(64) NOT NULL,result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id,request_key),
 FOREIGN KEY(connection_id,organization_id) REFERENCES connector_connections(id,organization_id) ON DELETE RESTRICT
);
