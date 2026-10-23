-- Stage18: additive lease stages, signature evidence and canonical resident relationships.
ALTER TABLE tasks ADD COLUMN purpose text NOT NULL DEFAULT 'crm' CHECK(purpose IN ('crm','move_in'));
CREATE TABLE task_creation_receipts(
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 namespace text NOT NULL CHECK(namespace IN ('lease_move_in','ai_follow_up')),request_key text NOT NULL CHECK(char_length(request_key) BETWEEN 1 AND 200),
 payload_hash char(64) NOT NULL,task_id uuid NOT NULL,actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,namespace,request_key),FOREIGN KEY(task_id,organization_id) REFERENCES tasks(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE organization_lease_settings(
 organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
 leased_milestone text NOT NULL CHECK(leased_milestone IN ('fully_signed','completed')),move_in_tasks jsonb NOT NULL CHECK(jsonb_typeof(move_in_tasks)='array'),
 configured_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE lease_configuration_receipts(
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,request_key uuid NOT NULL,
 actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,payload_hash char(64) NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,request_key)
);
CREATE TABLE lease_workflows(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,application_id uuid NOT NULL,lease_id uuid NOT NULL,
 stage text NOT NULL DEFAULT 'lease_preparation' CHECK(stage IN ('lease_preparation','signature_requested','partially_signed','fully_signed','move_in_scheduled','completed')),
 leased_milestone text NOT NULL CHECK(leased_milestone IN ('fully_signed','completed')),move_in_task_templates jsonb NOT NULL CHECK(jsonb_typeof(move_in_task_templates)='array'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),move_in_at timestamptz,
 signature_evidence_kind text CHECK(signature_evidence_kind IN ('manual_attestation','demo_event')),signature_evidence_reference text,signature_verified_at timestamptz,
 created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id),UNIQUE(organization_id,application_id),UNIQUE(organization_id,lease_id),
 FOREIGN KEY(application_id,organization_id) REFERENCES applications(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(lease_id,organization_id) REFERENCES leases(id,organization_id) ON DELETE RESTRICT,
 CHECK((signature_evidence_kind IS NULL)=(signature_verified_at IS NULL))
);
CREATE TABLE lease_workflow_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,workflow_id uuid NOT NULL,
 previous_stage text,stage text NOT NULL CHECK(stage IN ('lease_preparation','signature_requested','partially_signed','fully_signed','move_in_scheduled','completed')),
 evidence_kind text CHECK(evidence_kind IN ('manual_attestation','demo_event')),evidence_reference text NOT NULL DEFAULT '',
 actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,actor_membership_id uuid NOT NULL,
 request_key uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workflow_id,request_key),
 FOREIGN KEY(workflow_id,organization_id) REFERENCES lease_workflows(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(actor_membership_id,actor_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE lease_action_receipts(
 organization_id uuid NOT NULL,application_id uuid NOT NULL,request_key uuid NOT NULL,actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 operation text NOT NULL,payload_hash char(64) NOT NULL,result jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,application_id,request_key),FOREIGN KEY(application_id,organization_id) REFERENCES applications(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE resident_relationships(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,contact_id uuid NOT NULL,property_id uuid NOT NULL,unit_id uuid,
 application_id uuid NOT NULL,lease_id uuid NOT NULL,lead_id uuid,
 source text NOT NULL CHECK(source IN ('manual_attestation','demo_event')),status text NOT NULL DEFAULT 'pending_move_in' CHECK(status IN ('pending_move_in','active')),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,lease_id,contact_id),
 FOREIGN KEY(contact_id,organization_id,property_id) REFERENCES contact_property_links(contact_id,organization_id,property_id) ON DELETE RESTRICT,
 FOREIGN KEY(application_id,organization_id) REFERENCES applications(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(lease_id,organization_id) REFERENCES leases(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(unit_id,organization_id,property_id) REFERENCES units(id,organization_id,property_id) ON DELETE RESTRICT,
 FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX resident_contact_history_idx ON resident_relationships(organization_id,contact_id,created_at DESC);
ALTER TABLE lease_verified_milestones ADD COLUMN evidence_kind text NOT NULL DEFAULT 'manual_attestation' CHECK(evidence_kind IN ('manual_attestation','demo_event','provider_verified'));
-- Task completion/reassignment/generation rules stay unchanged. Only relevant move-in tasks survive Leased.
CREATE OR REPLACE FUNCTION ootla_cancel_task_reminders() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='tasks' THEN
  UPDATE task_reminders SET status='cancelled',cancelled_at=now() WHERE task_id=NEW.id AND status<>'cancelled' AND (NEW.status<>'open' OR generation<>NEW.reminder_generation OR recipient_membership_id IS DISTINCT FROM NEW.owner_membership_id);
 ELSIF TG_TABLE_NAME='leads' THEN
  IF NEW.pipeline_stage IN ('lost_closed','leased','won') THEN
   UPDATE task_reminders r SET status='cancelled',cancelled_at=now() FROM tasks t WHERE t.id=r.task_id AND t.organization_id=NEW.organization_id AND t.lead_id=NEW.id AND r.status<>'cancelled' AND (NEW.pipeline_stage<>'leased' OR t.purpose<>'move_in');
  END IF;
 ELSIF TG_TABLE_NAME='viewings' THEN
  IF NEW.status='cancelled' THEN
   UPDATE task_reminders r SET status='cancelled',cancelled_at=now() FROM tasks t WHERE t.id=r.task_id AND t.organization_id=NEW.organization_id AND t.tour_id=NEW.id AND r.status<>'cancelled';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
