-- Stage 08: persistent staff-private lead work. Prior identities, rows and migrations stay intact.
ALTER TABLE tasks ADD COLUMN contact_id uuid;
UPDATE tasks t SET contact_id=l.contact_id FROM leads l WHERE l.id=t.lead_id AND l.organization_id=t.organization_id AND l.property_id=t.property_id;
ALTER TABLE tasks ALTER COLUMN contact_id SET NOT NULL;
ALTER TABLE tasks ADD CONSTRAINT tasks_contact_lead_tenant_fkey FOREIGN KEY(lead_id,organization_id,property_id,contact_id) REFERENCES leads(id,organization_id,property_id,contact_id) ON DELETE RESTRICT;
ALTER TABLE tasks ADD COLUMN details text NOT NULL DEFAULT '' CHECK(char_length(details)<=5000);
ALTER TABLE tasks ADD COLUMN owner_membership_id uuid;
ALTER TABLE tasks ADD COLUMN created_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE tasks ADD COLUMN created_by_membership_id uuid;
ALTER TABLE tasks ADD COLUMN completed_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE tasks ADD COLUMN completed_by_membership_id uuid;
ALTER TABLE tasks ADD COLUMN completed_at timestamptz;
ALTER TABLE tasks ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE tasks ADD CONSTRAINT tasks_owner_tenant_fkey FOREIGN KEY(owner_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT;
ALTER TABLE tasks ADD CONSTRAINT tasks_creator_tenant_fkey FOREIGN KEY(created_by_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT;
ALTER TABLE tasks ADD CONSTRAINT tasks_completer_tenant_fkey FOREIGN KEY(completed_by_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT;
CREATE INDEX tasks_lead_workspace_idx ON tasks(organization_id,lead_id,status,due_at,id);
-- Compatibility with explicit old demo seeding: identity comes from the linked lead, never copied contact details.
CREATE FUNCTION ootla_task_contact_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.contact_id IS NULL THEN SELECT contact_id INTO NEW.contact_id FROM leads WHERE id=NEW.lead_id AND organization_id=NEW.organization_id AND property_id=NEW.property_id; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER tasks_contact_identity BEFORE INSERT ON tasks FOR EACH ROW EXECUTE FUNCTION ootla_task_contact_identity();
CREATE TABLE lead_workspace_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL,property_id uuid NOT NULL,contact_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('note','call','task_created','task_updated','document_uploaded','staff_decision')),
 summary text NOT NULL CHECK(char_length(btrim(summary)) BETWEEN 1 AND 10000),
 actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,actor_membership_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object'),
 FOREIGN KEY(lead_id,organization_id,property_id,contact_id) REFERENCES leads(id,organization_id,property_id,contact_id) ON DELETE RESTRICT,
 FOREIGN KEY(actor_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX lead_workspace_events_order_idx ON lead_workspace_events(organization_id,lead_id,occurred_at DESC,id);
CREATE TABLE lead_documents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL,property_id uuid NOT NULL,contact_id uuid NOT NULL,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 180),media_type text NOT NULL CHECK(media_type IN ('application/pdf','image/png','image/jpeg','text/plain')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 2097152),sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),content bytea NOT NULL,
 uploaded_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,uploaded_by_membership_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(octet_length(content)=size_bytes),
 FOREIGN KEY(lead_id,organization_id,property_id,contact_id) REFERENCES leads(id,organization_id,property_id,contact_id) ON DELETE RESTRICT,
 FOREIGN KEY(uploaded_by_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX lead_documents_order_idx ON lead_documents(organization_id,lead_id,created_at DESC,id);
-- This trusted-ingest foundation has NO browser write endpoint. An external ID alone is not verified evidence.
ALTER TABLE external_record_mappings ADD CONSTRAINT external_mapping_id_tenant_key UNIQUE(id,organization_id);
CREATE TABLE provider_verified_updates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL,property_id uuid NOT NULL,contact_id uuid NOT NULL,mapping_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider ~ '^[a-z][a-z0-9_-]{0,99}$'),external_event_id text NOT NULL CHECK(char_length(btrim(external_event_id)) BETWEEN 1 AND 200),
 summary text NOT NULL CHECK(char_length(btrim(summary)) BETWEEN 1 AND 5000),occurred_at timestamptz NOT NULL,
 verified_at timestamptz NOT NULL,verification_reference text NOT NULL CHECK(char_length(btrim(verification_reference)) BETWEEN 5 AND 500),
 CHECK(occurred_at<=verified_at),UNIQUE(organization_id,provider,external_event_id),
 FOREIGN KEY(lead_id,organization_id,property_id,contact_id) REFERENCES leads(id,organization_id,property_id,contact_id) ON DELETE RESTRICT,
 FOREIGN KEY(mapping_id,organization_id) REFERENCES external_record_mappings(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX provider_verified_updates_order_idx ON provider_verified_updates(organization_id,lead_id,occurred_at DESC,id);
-- A trusted update must map to this exact provider and lead's linked identity/property context.
CREATE FUNCTION ootla_provider_update_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mapped external_record_mappings%ROWTYPE; valid_context boolean:=false;
BEGIN
 SELECT * INTO mapped FROM external_record_mappings WHERE id=NEW.mapping_id AND organization_id=NEW.organization_id;
 IF NOT FOUND OR mapped.provider<>NEW.provider OR NEW.verified_at>now() THEN
  RAISE EXCEPTION 'Provider update requires matching verified source context' USING ERRCODE='23514';
 END IF;
 IF mapped.entity_type='property' THEN valid_context:=mapped.property_id=NEW.property_id;
 ELSIF mapped.entity_type='contact' THEN valid_context:=mapped.contact_id=NEW.contact_id;
 ELSIF mapped.entity_type='unit' THEN SELECT EXISTS(SELECT 1 FROM units WHERE id=mapped.unit_id AND organization_id=NEW.organization_id AND property_id=NEW.property_id) INTO valid_context;
 ELSIF mapped.entity_type='application' THEN SELECT EXISTS(SELECT 1 FROM applications WHERE id=mapped.application_id AND organization_id=NEW.organization_id AND property_id=NEW.property_id AND contact_id=NEW.contact_id AND lead_id=NEW.lead_id) INTO valid_context;
 ELSIF mapped.entity_type='lease' THEN SELECT EXISTS(SELECT 1 FROM leases WHERE id=mapped.lease_id AND organization_id=NEW.organization_id AND property_id=NEW.property_id AND contact_id=NEW.contact_id AND lead_id=NEW.lead_id) INTO valid_context;
 END IF;
 IF NOT COALESCE(valid_context,false) THEN RAISE EXCEPTION 'Provider mapping does not belong to this lead context' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER provider_update_context BEFORE INSERT OR UPDATE ON provider_verified_updates FOR EACH ROW EXECUTE FUNCTION ootla_provider_update_context();