-- Additive operational workspaces. Existing customer identities are not merged.
CREATE TABLE intake_forms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL,
 title text NOT NULL, enabled boolean NOT NULL DEFAULT false, owner_membership_id uuid,
 embed_origins text[] NOT NULL DEFAULT '{}', created_by uuid NOT NULL REFERENCES users(id),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id), FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),
 FOREIGN KEY(owner_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id)
);
CREATE TABLE intake_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, form_id uuid NOT NULL,
 request_key uuid NOT NULL, payload_hash char(64) NOT NULL, lead_id uuid NOT NULL, campaign text NOT NULL DEFAULT '',
 possible_duplicate boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(form_id,request_key), FOREIGN KEY(form_id,organization_id) REFERENCES intake_forms(id,organization_id),
 FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id)
);
CREATE INDEX intake_dedupe_idx ON intake_submissions(form_id,payload_hash,created_at DESC);
CREATE TABLE intake_rate_limits (bucket_key char(64) NOT NULL, window_at timestamptz NOT NULL, count integer NOT NULL, PRIMARY KEY(bucket_key,window_at));
CREATE TABLE conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL, lead_id uuid NOT NULL,
 owner_membership_id uuid, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id), UNIQUE(organization_id,lead_id), FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id),
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),
 FOREIGN KEY(owner_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id)
);
CREATE TABLE conversation_reads (
 conversation_id uuid NOT NULL REFERENCES conversations(id), user_id uuid NOT NULL REFERENCES users(id), read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(conversation_id,user_id)
);
CREATE TABLE conversation_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, conversation_id uuid NOT NULL,
 request_key uuid NOT NULL, direction text NOT NULL CHECK(direction IN ('inbound','outbound','internal')),
 channel text NOT NULL CHECK(channel IN ('email','sms','web')), subject text NOT NULL DEFAULT '', body text NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','sending','accepted','delivered','failed','uncertain','simulated','received','note','cancelled')),
 version integer NOT NULL DEFAULT 1, recipient text, provider text, provider_id text, reviewed_by uuid REFERENCES users(id),
 created_by uuid REFERENCES users(id), sent_at timestamptz, delivered_at timestamptz, provider_event_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,request_key), UNIQUE(provider,provider_id),
 FOREIGN KEY(conversation_id,organization_id) REFERENCES conversations(id,organization_id)
);
CREATE INDEX conversation_messages_timeline_idx ON conversation_messages(conversation_id,created_at,id);
CREATE TABLE contact_communication_preferences (
 organization_id uuid NOT NULL, contact_id uuid NOT NULL, channel text NOT NULL CHECK(channel IN ('email','sms')),
 allowed boolean NOT NULL, evidence text NOT NULL, updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,contact_id,channel), FOREIGN KEY(contact_id,organization_id) REFERENCES contacts(id,organization_id)
);
CREATE TABLE communication_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
 channel text NOT NULL CHECK(channel IN ('email','sms')), subject text NOT NULL DEFAULT '', body text NOT NULL,
 version integer NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE communication_receipts (
 provider text NOT NULL, event_id text NOT NULL, payload_hash char(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,event_id)
);
-- Persist delivery events even if the provider callback beats the send response.
CREATE TABLE communication_delivery_events (
 organization_id uuid NOT NULL REFERENCES organizations(id), provider text NOT NULL, provider_id text NOT NULL,
 status text NOT NULL, occurred_at timestamptz NOT NULL, PRIMARY KEY(provider,provider_id)
);
CREATE TABLE unmatched_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), channel text NOT NULL,
 sender text NOT NULL, subject text NOT NULL DEFAULT '', body text NOT NULL, provider_id text NOT NULL,
 resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,channel,provider_id)
);
CREATE TABLE followup_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), property_id uuid NOT NULL,
 name text NOT NULL, trigger text NOT NULL CHECK(trigger IN ('unanswered_inquiry','upcoming_tour','incomplete_application')),
 delay_minutes integer NOT NULL CHECK(delay_minutes BETWEEN 5 AND 43200), enabled boolean NOT NULL DEFAULT false,
 task_title text NOT NULL, draft_body text NOT NULL DEFAULT '', channel text NOT NULL DEFAULT 'email' CHECK(channel IN ('email','sms')),
 created_by uuid NOT NULL REFERENCES users(id), membership_id uuid NOT NULL, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id), FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),
 FOREIGN KEY(membership_id,organization_id) REFERENCES organization_memberships(id,organization_id)
);
CREATE TABLE followup_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, rule_id uuid NOT NULL, lead_id uuid NOT NULL,
 trigger_key text NOT NULL, task_id uuid, message_id uuid, status text NOT NULL CHECK(status IN ('created','stopped')),
 reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(rule_id,trigger_key), FOREIGN KEY(rule_id,organization_id) REFERENCES followup_rules(id,organization_id),
 FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id), FOREIGN KEY(task_id,organization_id) REFERENCES tasks(id,organization_id)
);
CREATE TABLE resident_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), resident_id uuid NOT NULL REFERENCES resident_relationships(id),
 property_id uuid NOT NULL, lead_id uuid, created_by uuid NOT NULL REFERENCES users(id), request_key uuid NOT NULL,
 title text NOT NULL, category text NOT NULL CHECK(category IN ('plumbing','electrical','appliance','access','other')),
 description text NOT NULL, priority text NOT NULL CHECK(priority IN ('normal','urgent')),
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','in_progress','waiting','resolved','closed')),
 owner_membership_id uuid, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id), UNIQUE(created_by,request_key), FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),
 FOREIGN KEY(owner_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id)
);
CREATE TABLE resident_request_updates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES resident_requests(id), actor_user_id uuid NOT NULL REFERENCES users(id),
 body text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE resident_request_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES resident_requests(id), uploaded_by uuid NOT NULL REFERENCES users(id),
 name text NOT NULL, media_type text NOT NULL, content bytea NOT NULL, sha256 char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(octet_length(content) BETWEEN 1 AND 5242880)
);
CREATE TABLE saved_lead_views (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
 name text NOT NULL, filters jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,user_id,name)
);
CREATE TABLE operation_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), property_id uuid,
 lead_id uuid, actor_user_id uuid REFERENCES users(id), kind text NOT NULL, summary text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),
 FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id)
);
CREATE INDEX operation_events_scope_idx ON operation_events(organization_id,property_id,created_at DESC);
CREATE TABLE property_knowledge (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL, title text NOT NULL,
 body text NOT NULL, source_url text NOT NULL DEFAULT '', published boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1, updated_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id)
);
ALTER TABLE assistant_requests DROP CONSTRAINT assistant_requests_action_check;
ALTER TABLE assistant_requests ADD CONSTRAINT assistant_requests_action_check CHECK(action IN ('summary','follow_up','next_actions','answer'));
ALTER TABLE assistant_requests ADD COLUMN question text NOT NULL DEFAULT '';
ALTER TABLE assistant_requests ADD COLUMN sources jsonb NOT NULL DEFAULT '[]';
ALTER TABLE assistant_requests ADD COLUMN edited_body text;
ALTER TABLE assistant_requests ADD COLUMN feedback text CHECK(feedback IN ('helpful','needs_work'));
ALTER TABLE assistant_requests ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TABLE lead_stage_observations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid NOT NULL, lead_id uuid NOT NULL,
 stage text NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(), initial boolean NOT NULL DEFAULT false,
 FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id)
);
INSERT INTO lead_stage_observations(organization_id,lead_id,stage,initial) SELECT organization_id,id,pipeline_stage,true FROM leads;
CREATE FUNCTION ootla_observe_lead_stage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' OR NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
  INSERT INTO lead_stage_observations(organization_id,lead_id,stage) VALUES(NEW.organization_id,NEW.id,NEW.pipeline_stage);
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER lead_stage_observation AFTER INSERT OR UPDATE OF pipeline_stage ON leads FOR EACH ROW EXECUTE FUNCTION ootla_observe_lead_stage();
CREATE INDEX lead_stage_observed_idx ON lead_stage_observations(organization_id,lead_id,observed_at,id);
