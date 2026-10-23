-- Stage15: additive applicant access and private application storage. Previous rows are untouched.
ALTER TABLE applications ADD COLUMN portal_version integer NOT NULL DEFAULT 1 CHECK(portal_version>0);
ALTER TABLE applications ADD COLUMN portal_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE applications ADD COLUMN co_applicants_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE applications ADD COLUMN portal_submitted_at timestamptz;
CREATE TABLE application_participants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, application_id uuid NOT NULL, contact_id uuid NOT NULL, property_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('primary','co_applicant')), invited_email text NOT NULL CHECK(invited_email=lower(btrim(invited_email)) AND char_length(invited_email)<=254),
 user_id uuid, account_kind text NOT NULL DEFAULT 'applicant' CHECK(account_kind='applicant'), active boolean NOT NULL DEFAULT true,
 details jsonb NOT NULL DEFAULT '{"displayName":"","phone":"","currentAddress":"","moveInDate":""}' CHECK(jsonb_typeof(details)='object'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), ready_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id,application_id),UNIQUE(application_id,organization_id,contact_id),
 FOREIGN KEY(application_id,organization_id) REFERENCES applications(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(contact_id,organization_id,property_id) REFERENCES contact_property_links(contact_id,organization_id,property_id) ON DELETE RESTRICT,
 FOREIGN KEY(user_id,account_kind) REFERENCES users(id,account_kind) ON DELETE RESTRICT
);
-- Snapshot the property grant at invitation configuration. Later CRM property changes cannot retarget existing applicant access.
CREATE FUNCTION ootla_application_participant_property() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.property_id IS NULL THEN SELECT property_id INTO NEW.property_id FROM applications WHERE id=NEW.application_id AND organization_id=NEW.organization_id; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER application_participant_property BEFORE INSERT ON application_participants FOR EACH ROW EXECUTE FUNCTION ootla_application_participant_property();
CREATE UNIQUE INDEX application_primary_participant_key ON application_participants(application_id,organization_id) WHERE role='primary' AND active;
CREATE UNIQUE INDEX application_user_participant_key ON application_participants(application_id,organization_id,user_id) WHERE user_id IS NOT NULL AND active;
CREATE INDEX application_participant_user_idx ON application_participants(user_id,organization_id,application_id) WHERE active;
CREATE TABLE application_checklist_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,application_id uuid NOT NULL,
 label text NOT NULL CHECK(char_length(btrim(label)) BETWEEN 1 AND 120),required boolean NOT NULL DEFAULT true,position integer NOT NULL DEFAULT 0,active boolean NOT NULL DEFAULT true,
 UNIQUE(id,organization_id,application_id),
 FOREIGN KEY(application_id,organization_id) REFERENCES applications(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE application_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,application_id uuid NOT NULL,participant_id uuid NOT NULL,
 token_digest char(64) NOT NULL UNIQUE,invited_email text NOT NULL,created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,used_at timestamptz,revoked_at timestamptz,
 FOREIGN KEY(participant_id,organization_id,application_id) REFERENCES application_participants(id,organization_id,application_id) ON DELETE RESTRICT,
 CHECK(expires_at>created_at)
);
CREATE INDEX application_invitation_participant_idx ON application_invitations(organization_id,application_id,participant_id,created_at DESC);
CREATE TABLE applicant_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),token_digest char(64) NOT NULL UNIQUE,user_id uuid NOT NULL,
 account_kind text NOT NULL DEFAULT 'applicant' CHECK(account_kind='applicant'),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,revoked_at timestamptz,
 FOREIGN KEY(user_id,account_kind) REFERENCES users(id,account_kind) ON DELETE RESTRICT,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '8 hours')
);
CREATE INDEX applicant_session_expiry_idx ON applicant_sessions(expires_at);
CREATE TABLE application_documents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,application_id uuid NOT NULL,participant_id uuid NOT NULL,checklist_item_id uuid NOT NULL,
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 180),media_type text NOT NULL CHECK(media_type IN ('application/pdf','image/png','image/jpeg','text/plain')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 2097152),sha256 char(64) NOT NULL,content bytea NOT NULL,
 uploaded_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(participant_id,checklist_item_id),CHECK(octet_length(content)=size_bytes),
 FOREIGN KEY(participant_id,organization_id,application_id) REFERENCES application_participants(id,organization_id,application_id) ON DELETE RESTRICT,
 FOREIGN KEY(checklist_item_id,organization_id,application_id) REFERENCES application_checklist_items(id,organization_id,application_id) ON DELETE RESTRICT
);
CREATE TABLE application_consents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,application_id uuid NOT NULL,participant_id uuid NOT NULL,
 version text NOT NULL CHECK(char_length(version) BETWEEN 1 AND 100),consent_text text NOT NULL,actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 accepted_at timestamptz NOT NULL DEFAULT now(),UNIQUE(participant_id,version),
 FOREIGN KEY(participant_id,organization_id,application_id) REFERENCES application_participants(id,organization_id,application_id) ON DELETE RESTRICT
);
CREATE TABLE application_portal_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,application_id uuid NOT NULL,participant_id uuid,
 actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,actor_kind text NOT NULL CHECK(actor_kind IN ('staff','applicant')),
 kind text NOT NULL CHECK(char_length(kind) BETWEEN 1 AND 100),summary text NOT NULL CHECK(char_length(summary) BETWEEN 1 AND 500),
 metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object'),occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(application_id,organization_id) REFERENCES applications(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(participant_id,organization_id,application_id) REFERENCES application_participants(id,organization_id,application_id) ON DELETE RESTRICT
);
CREATE INDEX application_portal_event_history_idx ON application_portal_events(organization_id,application_id,occurred_at DESC,id);
