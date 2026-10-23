-- Stage 09 extends the existing task identity. No retained task, lead or user is replaced.
ALTER TABLE tasks ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE tasks ALTER COLUMN contact_id DROP NOT NULL;
ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK(status IN ('open','completed','cancelled'));
ALTER TABLE tasks ADD COLUMN priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent'));
ALTER TABLE tasks ADD COLUMN origin text NOT NULL DEFAULT 'manual' CHECK(origin IN ('manual','demo','ai_simulation','import','system'));
UPDATE tasks SET origin='demo' WHERE seed_key LIKE 'stage03.%';
ALTER TABLE tasks ADD COLUMN application_id uuid;
ALTER TABLE tasks ADD COLUMN tour_id uuid;
ALTER TABLE tasks ADD COLUMN assignment text NOT NULL DEFAULT 'manual' CHECK(assignment IN ('manual','routing'));
ALTER TABLE tasks ADD COLUMN assignment_notice text CHECK(char_length(assignment_notice)<=500);
ALTER TABLE tasks ADD COLUMN reminder_generation integer NOT NULL DEFAULT 1 CHECK(reminder_generation>0);
ALTER TABLE tasks ADD CONSTRAINT tasks_id_tenant_key UNIQUE(id,organization_id);
ALTER TABLE tasks ADD CONSTRAINT tasks_property_tenant_fkey FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT;
ALTER TABLE tasks ADD CONSTRAINT tasks_contact_tenant_fkey FOREIGN KEY(contact_id,organization_id) REFERENCES contacts(id,organization_id) ON DELETE RESTRICT;
ALTER TABLE tasks ADD CONSTRAINT tasks_application_tenant_fkey FOREIGN KEY(application_id,organization_id) REFERENCES applications(id,organization_id) ON DELETE RESTRICT;

ALTER TABLE tasks ADD CONSTRAINT tasks_lead_requires_contact CHECK(lead_id IS NULL OR contact_id IS NOT NULL);
ALTER TABLE viewings ADD CONSTRAINT viewings_id_tenant_property_key UNIQUE(id,organization_id,property_id);
-- Re-add tour FK after the referenced unique identity has been declared.
ALTER TABLE tasks ADD CONSTRAINT tasks_tour_tenant_fkey FOREIGN KEY(tour_id,organization_id,property_id) REFERENCES viewings(id,organization_id,property_id) ON DELETE RESTRICT;
CREATE TABLE task_teams(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 120),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,organization_id),UNIQUE(organization_id,name));
CREATE TABLE task_team_members(organization_id uuid NOT NULL,team_id uuid NOT NULL,membership_id uuid NOT NULL,PRIMARY KEY(team_id,membership_id),FOREIGN KEY(team_id,organization_id) REFERENCES task_teams(id,organization_id) ON DELETE CASCADE,FOREIGN KEY(membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT);
CREATE TABLE task_routing_rules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,property_id uuid NOT NULL,team_id uuid,enabled boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,property_id),FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT,FOREIGN KEY(team_id,organization_id) REFERENCES task_teams(id,organization_id) ON DELETE RESTRICT);
ALTER TABLE tasks ADD COLUMN team_id uuid;
ALTER TABLE tasks ADD CONSTRAINT tasks_team_tenant_fkey FOREIGN KEY(team_id,organization_id) REFERENCES task_teams(id,organization_id) ON DELETE RESTRICT;
CREATE TABLE task_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,task_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('created','updated','completed','reopened','cancelled','assigned','reminder_snoozed')),actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,actor_membership_id uuid,occurred_at timestamptz NOT NULL DEFAULT now(),metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object'),FOREIGN KEY(task_id,organization_id) REFERENCES tasks(id,organization_id) ON DELETE RESTRICT,FOREIGN KEY(actor_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT);
CREATE INDEX task_events_order_idx ON task_events(organization_id,task_id,occurred_at DESC,id);
CREATE TABLE task_reminders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,task_id uuid NOT NULL,generation integer NOT NULL,recipient_membership_id uuid NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','retry','delivered','cancelled','failed')),scheduled_at timestamptz NOT NULL,next_attempt_at timestamptz NOT NULL,attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),snooze_count integer NOT NULL DEFAULT 0 CHECK(snooze_count BETWEEN 0 AND 3),snoozed_until timestamptz,delivered_at timestamptz,cancelled_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(task_id,generation,recipient_membership_id),FOREIGN KEY(task_id,organization_id) REFERENCES tasks(id,organization_id) ON DELETE RESTRICT,FOREIGN KEY(recipient_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT);
CREATE TABLE task_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,reminder_id uuid NOT NULL UNIQUE REFERENCES task_reminders(id) ON DELETE RESTRICT,recipient_membership_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(recipient_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT);
CREATE INDEX task_reminders_pending_idx ON task_reminders(next_attempt_at,id) WHERE status IN ('pending','retry');
CREATE INDEX task_notifications_recipient_idx ON task_notifications(organization_id,recipient_membership_id,created_at DESC,id);
CREATE INDEX tasks_owner_queue_idx ON tasks(organization_id,owner_membership_id,status,due_at,id);
CREATE INDEX tasks_property_queue_idx ON tasks(organization_id,property_id,status,due_at,id);
CREATE FUNCTION ootla_task_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked_lead uuid; linked_contact uuid; linked_property uuid;
BEGIN
 IF NEW.application_id IS NOT NULL THEN
  SELECT lead_id,contact_id,property_id INTO linked_lead,linked_contact,linked_property FROM applications WHERE id=NEW.application_id AND organization_id=NEW.organization_id;
  IF NOT FOUND OR linked_property<>NEW.property_id OR NEW.contact_id IS DISTINCT FROM linked_contact OR NEW.lead_id IS DISTINCT FROM linked_lead THEN RAISE EXCEPTION 'Task application context mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.tour_id IS NOT NULL THEN
  SELECT lead_id,property_id INTO linked_lead,linked_property FROM viewings WHERE id=NEW.tour_id AND organization_id=NEW.organization_id;
  IF NOT FOUND OR linked_property<>NEW.property_id OR NEW.lead_id IS DISTINCT FROM linked_lead THEN RAISE EXCEPTION 'Task tour context mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.contact_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contact_property_links WHERE organization_id=NEW.organization_id AND contact_id=NEW.contact_id AND property_id=NEW.property_id) THEN RAISE EXCEPTION 'Task contact property context mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER tasks_context BEFORE INSERT OR UPDATE OF property_id,lead_id,contact_id,application_id,tour_id ON tasks FOR EACH ROW EXECUTE FUNCTION ootla_task_context();
CREATE FUNCTION ootla_cancel_task_reminders() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='tasks' THEN
  UPDATE task_reminders SET status='cancelled',cancelled_at=now() WHERE task_id=NEW.id AND status<>'cancelled' AND (NEW.status<>'open' OR generation<>NEW.reminder_generation OR recipient_membership_id IS DISTINCT FROM NEW.owner_membership_id);
 ELSIF TG_TABLE_NAME='leads' THEN
  IF NEW.pipeline_stage IN ('lost_closed','leased','won') THEN
  UPDATE task_reminders r SET status='cancelled',cancelled_at=now() FROM tasks t WHERE t.id=r.task_id AND t.organization_id=NEW.organization_id AND t.lead_id=NEW.id AND r.status<>'cancelled';
   END IF;
 ELSIF TG_TABLE_NAME='viewings' THEN
  IF NEW.status='cancelled' THEN
  UPDATE task_reminders r SET status='cancelled',cancelled_at=now() FROM tasks t WHERE t.id=r.task_id AND t.organization_id=NEW.organization_id AND t.tour_id=NEW.id AND r.status<>'cancelled';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER tasks_cancel_reminders AFTER UPDATE OF status,owner_membership_id,reminder_generation ON tasks FOR EACH ROW EXECUTE FUNCTION ootla_cancel_task_reminders();
CREATE TRIGGER lead_cancel_task_reminders AFTER UPDATE OF pipeline_stage ON leads FOR EACH ROW EXECUTE FUNCTION ootla_cancel_task_reminders();
CREATE TRIGGER viewing_cancel_task_reminders AFTER UPDATE OF status ON viewings FOR EACH ROW EXECUTE FUNCTION ootla_cancel_task_reminders();