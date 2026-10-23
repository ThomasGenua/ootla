-- Stage17: external handoffs/status verification only. No payment collection or accounting operations.
CREATE TABLE payment_destinations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 100),url text NOT NULL CHECK(url LIKE 'https://%' AND char_length(url)<=1000),
 enabled boolean NOT NULL DEFAULT false,created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 updated_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id)
);
CREATE TABLE payment_configuration_receipts(
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,request_key uuid NOT NULL,
 actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,payload_hash char(64) NOT NULL,destination_id uuid NOT NULL REFERENCES payment_destinations(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,request_key)
);
CREATE TABLE application_payment_references(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,application_id uuid NOT NULL,property_id uuid NOT NULL,contact_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'unknown' CHECK(status IN ('unknown','pending','confirmed','unavailable')),
 source text NOT NULL DEFAULT 'unknown' CHECK(source IN ('unknown','ootla_payment_demo')),source_version integer NOT NULL DEFAULT 0 CHECK(source_version>=0),
 verified_at timestamptz,last_provider_event_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id),UNIQUE(organization_id,application_id),
 FOREIGN KEY(application_id,organization_id,property_id,contact_id) REFERENCES applications(id,organization_id,property_id,contact_id) ON DELETE RESTRICT,
 CHECK((source='unknown' AND verified_at IS NULL) OR (source='ootla_payment_demo' AND verified_at IS NOT NULL))
);
CREATE TABLE payment_handoffs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,payment_reference_id uuid NOT NULL,application_id uuid NOT NULL,participant_id uuid NOT NULL,
 token_digest char(64) NOT NULL UNIQUE,user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,session_digest char(64) NOT NULL REFERENCES applicant_sessions(token_digest) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 minutes'),
 FOREIGN KEY(payment_reference_id,organization_id) REFERENCES application_payment_references(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(participant_id,organization_id,application_id) REFERENCES application_participants(id,organization_id,application_id) ON DELETE RESTRICT
);
CREATE INDEX payment_handoff_expiry_idx ON payment_handoffs(expires_at);
CREATE TABLE payment_demo_provider_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,payment_reference_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 latest_event_id uuid,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(payment_reference_id),
 FOREIGN KEY(payment_reference_id,organization_id) REFERENCES application_payment_references(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE payment_demo_provider_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,payment_reference_id uuid NOT NULL,provider_record_id uuid NOT NULL REFERENCES payment_demo_provider_records(id) ON DELETE RESTRICT,
 event_id uuid NOT NULL UNIQUE,status text NOT NULL CHECK(status='confirmed'),provider_version integer NOT NULL CHECK(provider_version>0),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(payment_reference_id,provider_version),
 FOREIGN KEY(payment_reference_id,organization_id) REFERENCES application_payment_references(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE payment_event_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,payment_reference_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider='ootla_payment_demo'),provider_version integer NOT NULL CHECK(provider_version>0),event_id uuid,payload_hash char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(payment_reference_id,provider_version),UNIQUE(provider,event_id),
 FOREIGN KEY(payment_reference_id,organization_id) REFERENCES application_payment_references(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE payment_action_receipts(
 organization_id uuid NOT NULL,application_id uuid NOT NULL,request_key uuid NOT NULL,actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 operation text NOT NULL,payload_hash char(64) NOT NULL,result jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,application_id,request_key),
 FOREIGN KEY(application_id,organization_id) REFERENCES applications(id,organization_id) ON DELETE RESTRICT
);
