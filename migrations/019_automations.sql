-- Stage21: explicit approved rules, durable eligibility jobs and scoped activity.
CREATE TABLE organization_automation_settings(
 organization_id uuid PRIMARY KEY REFERENCES organizations(id),paused boolean NOT NULL DEFAULT false,
 updated_by_user_id uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE automation_rules(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),property_id uuid,
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 160),trigger text NOT NULL CHECK(trigger IN('new_inquiry','tour_follow_up','missed_viewing','missing_document','scheduled_follow_up','overdue_task','unassigned_maintenance')),
 delay_minutes integer NOT NULL CHECK(delay_minutes BETWEEN 0 AND 43200),assignment text NOT NULL CHECK(assignment IN('routing','manual')),owner_membership_id uuid,
 channel text NOT NULL CHECK(channel IN('in_app','website','email','sms')),template text NOT NULL CHECK(char_length(template) BETWEEN 1 AND 1000),knowledge_id uuid,
 max_attempts integer NOT NULL CHECK(max_attempts BETWEEN 1 AND 3),quiet_start integer NOT NULL CHECK(quiet_start BETWEEN 0 AND 23),quiet_end integer NOT NULL CHECK(quiet_end BETWEEN 0 AND 23),time_zone text NOT NULL,
 requires_approval boolean NOT NULL DEFAULT true,enabled boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,
 created_by_user_id uuid NOT NULL REFERENCES users(id),created_by_membership_id uuid NOT NULL,approved_by_user_id uuid NOT NULL REFERENCES users(id),approved_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,organization_id),
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),FOREIGN KEY(owner_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id),
 FOREIGN KEY(knowledge_id,organization_id) REFERENCES ai_knowledge(id,organization_id),FOREIGN KEY(created_by_membership_id,created_by_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id)
);
CREATE INDEX automation_rules_scope_idx ON automation_rules(organization_id,enabled,property_id,id);
CREATE TABLE automation_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,rule_id uuid NOT NULL,rule_version integer NOT NULL,property_id uuid NOT NULL,
 subject_kind text NOT NULL CHECK(subject_kind IN('lead','tour','application','task','maintenance')),subject_id uuid NOT NULL,source_state char(64) NOT NULL,
 lead_id uuid,contact_id uuid,application_id uuid,tour_id uuid,conversation_id uuid,label text NOT NULL,reason text NOT NULL,record_url text NOT NULL,
 status text NOT NULL CHECK(status IN('awaiting_approval','queued','completed','cancelled','failed')),body text NOT NULL,attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 max_attempts integer NOT NULL CHECK(max_attempts BETWEEN 1 AND 3),due_at timestamptz NOT NULL,next_attempt_at timestamptz NOT NULL,last_error text,
 task_id uuid,created_task_version integer,message_id uuid,approved_by_user_id uuid REFERENCES users(id),approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,organization_id),UNIQUE(rule_id,subject_kind,subject_id,source_state),
 FOREIGN KEY(rule_id,organization_id) REFERENCES automation_rules(id,organization_id),FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),
 FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id),FOREIGN KEY(contact_id,organization_id) REFERENCES contacts(id,organization_id),
 FOREIGN KEY(application_id,organization_id) REFERENCES applications(id,organization_id),FOREIGN KEY(tour_id,organization_id) REFERENCES viewings(id,organization_id),
 FOREIGN KEY(task_id,organization_id) REFERENCES tasks(id,organization_id),FOREIGN KEY(conversation_id,organization_id) REFERENCES customer_conversations(id,organization_id),
 FOREIGN KEY(message_id,organization_id) REFERENCES conversation_messages(id,organization_id)
);
CREATE INDEX automation_jobs_due_idx ON automation_jobs(status,next_attempt_at,id);
CREATE INDEX automation_jobs_activity_idx ON automation_jobs(organization_id,property_id,created_at DESC,id);
ALTER TABLE conversation_outbox ADD COLUMN automation_job_id uuid;
ALTER TABLE conversation_outbox ADD CONSTRAINT conversation_outbox_automation_job_fkey FOREIGN KEY(automation_job_id,organization_id) REFERENCES automation_jobs(id,organization_id);
CREATE TABLE automation_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),rule_id uuid,job_id uuid,kind text NOT NULL,reason text NOT NULL,
 actor_user_id uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(rule_id,organization_id) REFERENCES automation_rules(id,organization_id),FOREIGN KEY(job_id,organization_id) REFERENCES automation_jobs(id,organization_id)
);
CREATE INDEX automation_events_scope_idx ON automation_events(organization_id,created_at DESC,id);
CREATE TABLE automation_action_receipts(
 organization_id uuid NOT NULL REFERENCES organizations(id),actor_user_id uuid NOT NULL REFERENCES users(id),request_key uuid NOT NULL,operation text NOT NULL,payload_hash text NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,actor_user_id,request_key)
);
ALTER TABLE task_creation_receipts DROP CONSTRAINT task_creation_receipts_namespace_check;
ALTER TABLE task_creation_receipts ADD CONSTRAINT task_creation_receipts_namespace_check CHECK(namespace IN('lease_move_in','ai_follow_up','automation'));

ALTER TABLE automation_rules ADD COLUMN knowledge_version integer;
ALTER TABLE automation_rules ADD COLUMN scan_page integer NOT NULL DEFAULT 1 CHECK(scan_page>0);
ALTER TABLE automation_rules ADD COLUMN last_scan_at timestamptz;
ALTER TABLE automation_jobs ADD COLUMN source_snapshot jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(source_snapshot)='object');
