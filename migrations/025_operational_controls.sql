-- Stage26. Explicit opt-in retention; no default deletion or automatic seed.
CREATE TABLE organization_retention_policies(organization_id uuid NOT NULL REFERENCES organizations(id),category text NOT NULL CHECK(category IN('conversation_transcripts','assistant_history','retired_knowledge','operational_traces','closed_record_files')),retention_days integer CHECK(retention_days BETWEEN 1 AND 36500),configured_by_user_id uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(organization_id,category));
CREATE TABLE retention_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),actor_user_id uuid REFERENCES users(id),request_key uuid NOT NULL,counts jsonb NOT NULL DEFAULT '{}',completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(organization_id,request_key));
CREATE TABLE operational_action_receipts(organization_id uuid NOT NULL REFERENCES organizations(id),actor_user_id uuid NOT NULL REFERENCES users(id),request_key uuid NOT NULL,operation text NOT NULL,payload_hash char(64) NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(organization_id,request_key));
ALTER TABLE audit_events ADD COLUMN source text NOT NULL DEFAULT 'application' CHECK(source IN('application','staff','applicant','resident','system','connector','ai'));
ALTER TABLE audit_events ADD COLUMN outcome text NOT NULL DEFAULT 'succeeded' CHECK(outcome IN('succeeded','failed','denied','queued','cancelled'));
ALTER TABLE audit_events ADD COLUMN record_type text;
ALTER TABLE audit_events ADD COLUMN record_id uuid;
ALTER TABLE ask_threads ADD COLUMN retention_expired_at timestamptz;
ALTER TABLE ai_requests ADD COLUMN retention_expired_at timestamptz;
ALTER TABLE conversation_messages ADD COLUMN retention_expired_at timestamptz;
ALTER TABLE ai_knowledge ADD COLUMN retention_expired_at timestamptz;
DO $$ DECLARE target text; item record; BEGIN
 FOREACH target IN ARRAY ARRAY['lead_documents','application_documents','maintenance_files','screening_reports'] LOOP
  EXECUTE format('ALTER TABLE %I ALTER COLUMN content DROP NOT NULL',target);
  EXECUTE format('ALTER TABLE %I ADD COLUMN retention_expired_at timestamptz',target);
  FOR item IN SELECT conname FROM pg_constraint WHERE conrelid=target::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%octet_length(content)%' LOOP EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',target,item.conname); END LOOP;
  IF target='screening_reports' THEN EXECUTE format('ALTER TABLE %I ADD CONSTRAINT retained_content_size_check CHECK(content IS NULL OR octet_length(content) BETWEEN 1 AND 16000)',target);
  ELSE EXECUTE format('ALTER TABLE %I ADD CONSTRAINT retained_content_size_check CHECK(content IS NULL OR octet_length(content)=size_bytes)',target); END IF;
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT expired_content_empty_check CHECK(retention_expired_at IS NULL OR content IS NULL)',target);
 END LOOP;
END $$;
CREATE INDEX retention_conversation_age_idx ON conversation_messages(organization_id,created_at) WHERE retention_expired_at IS NULL;
CREATE INDEX retention_ask_age_idx ON ask_threads(organization_id,updated_at) WHERE retention_expired_at IS NULL;
CREATE INDEX retention_ai_age_idx ON ai_requests(organization_id,completed_at) WHERE retention_expired_at IS NULL;
CREATE INDEX audit_scope_action_idx ON audit_events(organization_id,action,created_at DESC,id DESC);
