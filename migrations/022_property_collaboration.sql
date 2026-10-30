CREATE TABLE maintenance_approval_policies (
 property_id uuid PRIMARY KEY REFERENCES properties(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 manager_threshold numeric(12,2) NOT NULL CHECK(manager_threshold>=0), currency char(3) NOT NULL, version integer NOT NULL DEFAULT 1
);
CREATE TABLE vendor_job_access (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), work_order_id uuid NOT NULL REFERENCES maintenance_work_orders(id),
 vendor_id uuid NOT NULL REFERENCES maintenance_vendors(id), token_digest text NOT NULL UNIQUE,
 issued_by uuid NOT NULL REFERENCES organization_memberships(id), expires_at timestamptz NOT NULL, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE vendor_job_updates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), work_order_id uuid NOT NULL REFERENCES maintenance_work_orders(id),
 vendor_id uuid NOT NULL REFERENCES maintenance_vendors(id), access_id uuid NOT NULL REFERENCES vendor_job_access(id),
 request_key uuid NOT NULL, payload_hash text NOT NULL, action text NOT NULL CHECK(action IN ('accept','decline','appointment','completion')),
 note text NOT NULL, starts_at timestamptz, ends_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(access_id,request_key)
);
CREATE TABLE maintenance_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), work_order_id uuid NOT NULL REFERENCES maintenance_work_orders(id),
 vendor_id uuid NOT NULL REFERENCES maintenance_vendors(id), access_id uuid NOT NULL REFERENCES vendor_job_access(id),
 request_key uuid NOT NULL, description text NOT NULL, amount numeric(12,2) NOT NULL CHECK(amount>=0), currency char(3) NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','superseded')), decision_note text NOT NULL DEFAULT '',
 decided_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(access_id,request_key)
);
CREATE TABLE vendor_job_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), work_order_id uuid NOT NULL REFERENCES maintenance_work_orders(id),
 vendor_id uuid NOT NULL REFERENCES maintenance_vendors(id), access_id uuid NOT NULL REFERENCES vendor_job_access(id),
 category text NOT NULL CHECK(category IN ('photo','invoice')), name text NOT NULL, media_type text NOT NULL,
 content bytea NOT NULL CHECK(octet_length(content)<=2097152), sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(work_order_id,vendor_id,category,sha256)
);
CREATE TABLE inspection_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
 items jsonb NOT NULL, version integer NOT NULL DEFAULT 1, active boolean NOT NULL DEFAULT true
);
CREATE TABLE unit_inspections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL, unit_id uuid NOT NULL,
 template_id uuid NOT NULL REFERENCES inspection_templates(id), kind text NOT NULL CHECK(kind IN ('move_in','move_out','routine')),
 owner_membership_id uuid REFERENCES organization_memberships(id), due_on date NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','completed')),
 items jsonb NOT NULL, observations jsonb NOT NULL DEFAULT '[]', baseline_id uuid REFERENCES unit_inspections(id),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 FOREIGN KEY(unit_id,organization_id,property_id) REFERENCES units(id,organization_id,property_id)
);
CREATE TABLE inspection_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), inspection_id uuid NOT NULL REFERENCES unit_inspections(id), item_key text NOT NULL,
 name text NOT NULL, media_type text NOT NULL CHECK(media_type IN ('image/png','image/jpeg')), content bytea NOT NULL CHECK(octet_length(content)<=2097152),
 sha256 text NOT NULL, uploaded_by uuid NOT NULL REFERENCES users(id), UNIQUE(inspection_id,item_key,sha256)
);
CREATE TABLE inspection_repairs (
 inspection_id uuid NOT NULL REFERENCES unit_inspections(id), item_key text NOT NULL, task_id uuid NOT NULL REFERENCES tasks(id), PRIMARY KEY(inspection_id,item_key)
);
ALTER TABLE task_creation_receipts DROP CONSTRAINT task_creation_receipts_namespace_check;
ALTER TABLE task_creation_receipts ADD CONSTRAINT task_creation_receipts_namespace_check CHECK(namespace IN ('lease_move_in','ai_follow_up','inspection_repair'));
CREATE TABLE resident_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), property_id uuid NOT NULL REFERENCES properties(id),
 lead_id uuid REFERENCES leads(id), resident_id uuid NOT NULL REFERENCES resident_relationships(id), title text NOT NULL,
 category text NOT NULL CHECK(category IN ('lease','renewal','building_guide','notice','other')), expires_on date,
 acknowledgement_required boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 latest_version integer NOT NULL DEFAULT 0, published_version integer, version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE resident_document_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES resident_documents(id), number integer NOT NULL,
 name text NOT NULL, media_type text NOT NULL, content bytea NOT NULL CHECK(octet_length(content)<=2097152), sha256 text NOT NULL,
 uploaded_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(document_id,number)
);
CREATE TABLE resident_document_acknowledgements (
 document_id uuid NOT NULL REFERENCES resident_documents(id), document_version integer NOT NULL, user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(document_id,document_version,user_id),
 FOREIGN KEY(document_id,document_version) REFERENCES resident_document_versions(document_id,number)
);
CREATE TABLE staff_notification_states (
 membership_id uuid NOT NULL REFERENCES organization_memberships(id), notification_key text NOT NULL,
 read_at timestamptz, snoozed_until timestamptz, PRIMARY KEY(membership_id,notification_key)
);
CREATE TABLE staff_notification_preferences (
 membership_id uuid PRIMARY KEY REFERENCES organization_memberships(id), categories text[] NOT NULL, version integer NOT NULL DEFAULT 1
);
ALTER TABLE maintenance_work_orders ADD COLUMN completed_at timestamptz;
ALTER TABLE unit_turnovers ADD COLUMN tracked_since timestamptz;
ALTER TABLE unit_turnovers ALTER COLUMN tracked_since SET DEFAULT now();
CREATE FUNCTION track_work_order_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status<>'completed' THEN NEW.completed_at=now();
 ELSIF NEW.status<>'completed' THEN NEW.completed_at=NULL; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER work_order_completion_clock BEFORE UPDATE ON maintenance_work_orders FOR EACH ROW EXECUTE FUNCTION track_work_order_completion();
CREATE INDEX inspections_due ON unit_inspections(organization_id,status,due_on);
CREATE INDEX resident_documents_relationship ON resident_documents(resident_id,status);
CREATE INDEX vendor_updates_order ON vendor_job_updates(work_order_id,created_at DESC);

ALTER TABLE units ADD COLUMN availability_observed_since timestamptz;
CREATE FUNCTION track_unit_availability() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status='available' THEN NEW.availability_observed_since=now(); END IF;
 ELSIF NEW.status<>OLD.status THEN
  NEW.availability_observed_since=CASE WHEN NEW.status='available' THEN now() ELSE NULL END;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER unit_availability_clock BEFORE INSERT OR UPDATE ON units FOR EACH ROW EXECUTE FUNCTION track_unit_availability();
