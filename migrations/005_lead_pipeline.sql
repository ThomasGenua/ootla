-- Stage 07 adds a persistent CRM pipeline without rewriting prior identities or fixture columns.
ALTER TABLE leads ADD COLUMN pipeline_stage text;
UPDATE leads SET pipeline_stage=CASE WHEN status='viewing_scheduled' THEN CASE WHEN intent='sales' THEN 'viewing_scheduled' ELSE 'tour_scheduled' END WHEN status='new' THEN 'new_inquiry' ELSE 'contacted' END;
ALTER TABLE leads ALTER COLUMN pipeline_stage SET DEFAULT 'new_inquiry';
ALTER TABLE leads ALTER COLUMN pipeline_stage SET NOT NULL;
ALTER TABLE leads ADD CONSTRAINT leads_pipeline_stage_check CHECK(
 (intent='leasing' AND pipeline_stage IN ('new_inquiry','contacted','tour_scheduled','application_started','application_submitted','staff_review','lease_pending','leased','lost_closed')) OR
 (intent='sales' AND pipeline_stage IN ('new_inquiry','contacted','viewing_scheduled','negotiation','offer_pending','won','lost_closed')));
ALTER TABLE leads ADD COLUMN owner_membership_id uuid;
ALTER TABLE leads ADD CONSTRAINT leads_owner_tenant_fkey FOREIGN KEY(owner_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT;
ALTER TABLE leads ADD COLUMN source text NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','website','referral','portal','phone','email','import','other','demo'));
UPDATE leads SET source='demo' WHERE seed_key LIKE 'stage03.%';
ALTER TABLE leads ADD COLUMN preferences jsonb NOT NULL DEFAULT '{"bedrooms":null,"budgetMin":null,"budgetMax":null,"moveInOn":null,"locations":[],"requirements":""}' CHECK(jsonb_typeof(preferences)='object');
ALTER TABLE leads ADD COLUMN next_action_at timestamptz;
ALTER TABLE leads ADD COLUMN next_action text NOT NULL DEFAULT '' CHECK(char_length(next_action)<=500);
UPDATE leads l SET next_action=t.title,next_action_at=t.due_at FROM tasks t WHERE t.organization_id=l.organization_id AND t.lead_id=l.id AND t.status='open' AND t.id=(SELECT tt.id FROM tasks tt WHERE tt.organization_id=l.organization_id AND tt.lead_id=l.id AND tt.status='open' ORDER BY tt.due_at,tt.id LIMIT 1);
ALTER TABLE leads ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE applications ADD CONSTRAINT applications_lead_summary_key UNIQUE(id,organization_id,lead_id);
ALTER TABLE leads ADD COLUMN application_summary_id uuid;
ALTER TABLE leads ADD COLUMN application_summary_status text CHECK(application_summary_status IN ('draft','submitted','staff_review'));
ALTER TABLE leads ADD CONSTRAINT leads_application_summary_fkey FOREIGN KEY(application_summary_id,organization_id,id) REFERENCES applications(id,organization_id,lead_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE leads ADD CONSTRAINT leads_application_summary_pair CHECK((application_summary_id IS NULL)=(application_summary_status IS NULL));
ALTER TABLE leads ADD CONSTRAINT leads_id_organization_key UNIQUE(id,organization_id);
ALTER TABLE leads ADD CONSTRAINT leads_interest_identity_key UNIQUE(id,organization_id,contact_id);
CREATE TABLE lead_property_interests(
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,lead_id uuid NOT NULL,contact_id uuid NOT NULL,property_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(lead_id,organization_id,property_id),
 FOREIGN KEY(lead_id,organization_id,contact_id) REFERENCES leads(id,organization_id,contact_id) ON DELETE CASCADE,
 FOREIGN KEY(contact_id,organization_id,property_id) REFERENCES contact_property_links(contact_id,organization_id,property_id) ON DELETE RESTRICT
);
-- The primary property is always an explicit interest. Existing lead identity remains intact.
INSERT INTO lead_property_interests(organization_id,lead_id,contact_id,property_id) SELECT organization_id,id,contact_id,property_id FROM leads;
CREATE INDEX lead_interest_property_idx ON lead_property_interests(organization_id,property_id,lead_id);
CREATE TABLE lead_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,lead_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('created','updated','stage_changed','application_summary','lease_verified')),
 previous_stage text,stage text NOT NULL,actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 actor_membership_id uuid NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object'),
 FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id) ON DELETE CASCADE,
 FOREIGN KEY(actor_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX lead_events_history_idx ON lead_events(organization_id,lead_id,occurred_at DESC,id);
ALTER TABLE leases ADD CONSTRAINT leases_verified_relationship_key UNIQUE(id,organization_id,property_id,contact_id,lead_id);
CREATE TABLE lease_verified_milestones(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL,lease_id uuid NOT NULL,property_id uuid NOT NULL,contact_id uuid NOT NULL,
 lease_updated_at timestamptz NOT NULL, evidence_reference text NOT NULL CHECK(char_length(btrim(evidence_reference)) BETWEEN 5 AND 500),
 verified_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,verified_by_membership_id uuid NOT NULL,verified_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,lease_id,lease_updated_at),
 FOREIGN KEY(lead_id,organization_id,property_id,contact_id) REFERENCES leads(id,organization_id,property_id,contact_id) ON DELETE RESTRICT,
 FOREIGN KEY(lease_id,organization_id,property_id,contact_id,lead_id) REFERENCES leases(id,organization_id,property_id,contact_id,lead_id) ON DELETE RESTRICT,
 FOREIGN KEY(verified_by_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX lead_directory_idx ON leads(organization_id,intent,pipeline_stage,updated_at DESC,id);
CREATE INDEX lead_owner_idx ON leads(organization_id,owner_membership_id,updated_at DESC,id);
CREATE INDEX lead_next_action_idx ON leads(organization_id,next_action_at,id);
CREATE FUNCTION ootla_lead_legacy_pipeline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.pipeline_stage='new_inquiry' AND NEW.status<>'new' THEN
  NEW.pipeline_stage:=CASE WHEN NEW.status='viewing_scheduled' THEN CASE WHEN NEW.intent='sales' THEN 'viewing_scheduled' ELSE 'tour_scheduled' END ELSE 'contacted' END;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER leads_legacy_pipeline BEFORE INSERT ON leads FOR EACH ROW EXECUTE FUNCTION ootla_lead_legacy_pipeline();
CREATE FUNCTION ootla_lead_primary_interest() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO lead_property_interests(organization_id,lead_id,contact_id,property_id) VALUES(NEW.organization_id,NEW.id,NEW.contact_id,NEW.property_id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END;
$$;
CREATE TRIGGER leads_primary_interest AFTER INSERT ON leads FOR EACH ROW EXECUTE FUNCTION ootla_lead_primary_interest();
UPDATE leads l SET application_summary_id=a.id,application_summary_status=a.status FROM LATERAL(SELECT id,status,lead_id,organization_id FROM applications) a WHERE a.lead_id=l.id AND a.organization_id=l.organization_id AND a.id=(SELECT aa.id FROM applications aa WHERE aa.lead_id=l.id AND aa.organization_id=l.organization_id ORDER BY aa.updated_at DESC,aa.created_at DESC,aa.id LIMIT 1);
