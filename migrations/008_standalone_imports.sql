-- Stage 10: persistent standalone onboarding and reversible, reviewed CSV imports.
ALTER TABLE external_record_mappings ADD COLUMN lead_id uuid;
ALTER TABLE external_record_mappings DROP CONSTRAINT external_record_mappings_entity_type_check;
ALTER TABLE external_record_mappings DROP CONSTRAINT external_record_mappings_check;
ALTER TABLE external_record_mappings DROP CONSTRAINT external_record_mappings_check1;
ALTER TABLE external_record_mappings ADD CONSTRAINT external_record_mappings_entity_type_check CHECK(entity_type IN ('property','unit','contact','application','lease','lead'));
ALTER TABLE external_record_mappings ADD CONSTRAINT external_record_mappings_one_entity CHECK(num_nonnulls(property_id,unit_id,contact_id,application_id,lease_id,lead_id)=1);
ALTER TABLE external_record_mappings ADD CONSTRAINT external_record_mappings_typed_entity CHECK((entity_type='property' AND property_id IS NOT NULL) OR (entity_type='unit' AND unit_id IS NOT NULL) OR (entity_type='contact' AND contact_id IS NOT NULL) OR (entity_type='application' AND application_id IS NOT NULL) OR (entity_type='lease' AND lease_id IS NOT NULL) OR (entity_type='lead' AND lead_id IS NOT NULL));
ALTER TABLE external_record_mappings ADD CONSTRAINT external_mapping_lead_tenant_fkey FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX external_mapping_lead_key ON external_record_mappings(organization_id,provider,lead_id) WHERE lead_id IS NOT NULL;
CREATE TABLE import_batches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 entity text NOT NULL CHECK(entity IN ('properties','units','contacts','leads')),filename text NOT NULL,source_name text NOT NULL,
 upload_sha256 text NOT NULL,headers jsonb NOT NULL CHECK(jsonb_typeof(headers)='array'),mapping jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(mapping)='object'),
 status text NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','mapped','review','queued','running','completed','failed','undone')),
 row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 10000),created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_by_membership_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 confirmed_at timestamptz,completed_at timestamptz,attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),next_attempt_at timestamptz NOT NULL DEFAULT now(),last_error text,
 UNIQUE(id,organization_id),UNIQUE(organization_id,source_name,entity,upload_sha256),
 FOREIGN KEY(created_by_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE import_rows(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,batch_id uuid NOT NULL,row_number integer NOT NULL,
 raw_values jsonb NOT NULL CHECK(jsonb_typeof(raw_values)='object'),normalized jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(normalized)='object'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','valid','invalid','needs_review','ready','created','linked','skipped','failed','undone','retained')),
 errors jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(errors)='array'),duplicates jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(duplicates)='array'),
 decision text CHECK(decision IN ('create','use_existing','skip')),existing_contact_id uuid,record_id uuid,mapping_id uuid,
 created_record boolean NOT NULL DEFAULT false,snapshot jsonb,snapshot_revision bigint,result text,processed_at timestamptz,attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),next_attempt_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(batch_id,row_number),FOREIGN KEY(batch_id,organization_id) REFERENCES import_batches(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(existing_contact_id,organization_id) REFERENCES contacts(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX import_batches_worker_idx ON import_batches(status,next_attempt_at,created_at);
CREATE INDEX import_rows_page_idx ON import_rows(organization_id,batch_id,row_number);
CREATE INDEX import_rows_status_idx ON import_rows(batch_id,status,row_number);
CREATE INDEX import_rows_record_idx ON import_rows(organization_id,record_id) WHERE created_record;
ALTER TABLE properties ADD COLUMN import_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE units ADD COLUMN import_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE contacts ADD COLUMN import_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN import_revision bigint NOT NULL DEFAULT 0;
CREATE FUNCTION ootla_import_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.import_revision:=OLD.import_revision+1;
 RETURN NEW;
END;
$$;
CREATE TRIGGER properties_import_revision BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION ootla_import_revision();
CREATE TRIGGER units_import_revision BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION ootla_import_revision();
CREATE TRIGGER contacts_import_revision BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION ootla_import_revision();
CREATE TRIGGER leads_import_revision BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION ootla_import_revision();
-- Any later related work, including creation then removal, marks an imported record
-- touched. Transaction-local context excludes only the import's own writes/undo.
CREATE FUNCTION ootla_import_touch_related() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE value jsonb; item record; target_id uuid; active_batch text;
BEGIN
 IF current_setting('ootla.import_undo',true)='true' THEN RETURN NULL; END IF;
 active_batch:=current_setting('ootla.import_batch',true);
 FOR value IN SELECT v FROM (VALUES(CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END),(CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END)) AS valueset(v) WHERE v IS NOT NULL LOOP
  FOR item IN SELECT * FROM (VALUES('property_id','properties'),('unit_id','units'),('contact_id','contacts'),('lead_id','leads')) AS targets(key,table_name) LOOP
   IF value->>item.key IS NULL THEN CONTINUE; END IF;
   target_id:=(value->>item.key)::uuid;
   IF active_batch IS NOT NULL AND active_batch<>'' AND EXISTS(SELECT 1 FROM import_rows ir WHERE ir.batch_id::text=active_batch AND ir.record_id=target_id AND ir.created_record) THEN CONTINUE; END IF;
   EXECUTE format('UPDATE %I SET import_revision=import_revision WHERE id=$1 AND organization_id=$2 AND EXISTS(SELECT 1 FROM import_rows ir WHERE ir.record_id=$1 AND ir.organization_id=$2 AND ir.created_record AND ir.status NOT IN (''undone''))',item.table_name) USING target_id,(value->>'organization_id')::uuid;
  END LOOP;
 END LOOP;
 RETURN NULL;
END;
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['units','leads','contact_property_links','household_members','household_property_links','lead_property_interests','property_access_assignments','tasks','viewings','applications','leases','lead_activities','lead_events','lead_workspace_events','lead_documents','provider_verified_updates','lease_verified_milestones','external_record_mappings'] LOOP
  EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ootla_import_touch_related()',t||'_import_touch',t);
 END LOOP;
END $$;
