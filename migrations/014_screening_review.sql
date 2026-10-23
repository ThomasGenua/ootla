-- Stage16: screening coordination and human decisions remain separate from application status.
CREATE TABLE screening_consents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,application_id uuid NOT NULL,participant_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose='screening'),version text NOT NULL CHECK(char_length(version) BETWEEN 1 AND 100),consent_text text NOT NULL,
 actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,accepted_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,
 UNIQUE(id,organization_id,application_id,participant_id),UNIQUE(participant_id,purpose,version),
 FOREIGN KEY(participant_id,organization_id,application_id) REFERENCES application_participants(id,organization_id,application_id) ON DELETE RESTRICT
);
CREATE TABLE screening_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,application_id uuid NOT NULL,participant_id uuid NOT NULL,consent_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider='ootla_screening_demo'),provider_request_id uuid NOT NULL DEFAULT gen_random_uuid(),
 status text NOT NULL CHECK(status IN ('submitted','provider_reviewing','report_received','failed','staff_review_pending')),
 requested_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,requested_by_membership_id uuid NOT NULL,
 reviewed_at timestamptz,reviewed_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id),UNIQUE(organization_id,application_id,participant_id),UNIQUE(provider,provider_request_id),
 FOREIGN KEY(participant_id,organization_id,application_id) REFERENCES application_participants(id,organization_id,application_id) ON DELETE RESTRICT,
 FOREIGN KEY(consent_id,organization_id,application_id,participant_id) REFERENCES screening_consents(id,organization_id,application_id,participant_id) ON DELETE RESTRICT,
 FOREIGN KEY(requested_by_membership_id,requested_by_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE screening_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,screening_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','waiting','failed','completed')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 resume_status text NOT NULL DEFAULT 'submitted' CHECK(resume_status IN ('submitted','provider_reviewing','report_received')),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),error_code text,
 requested_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,requested_by_membership_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(screening_id),FOREIGN KEY(screening_id,organization_id) REFERENCES screening_requests(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(requested_by_membership_id,requested_by_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX screening_job_queue_idx ON screening_jobs(status,next_attempt_at,id);
CREATE TABLE screening_demo_provider_records(
 provider_request_id uuid PRIMARY KEY,organization_id uuid NOT NULL,screening_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('submitted','provider_reviewing','report_received')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 report_content bytea,updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(screening_id),FOREIGN KEY(screening_id,organization_id) REFERENCES screening_requests(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE screening_event_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,screening_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider='ootla_screening_demo'),event_id uuid NOT NULL,payload_hash char(64) NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,event_id),FOREIGN KEY(screening_id,organization_id) REFERENCES screening_requests(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE screening_reports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,screening_id uuid NOT NULL,content bytea NOT NULL,
 media_type text NOT NULL DEFAULT 'text/plain' CHECK(media_type='text/plain'),sha256 char(64) NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(screening_id),CHECK(octet_length(content) BETWEEN 1 AND 16000),
 FOREIGN KEY(screening_id,organization_id) REFERENCES screening_requests(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE screening_action_receipts(
 organization_id uuid NOT NULL,application_id uuid NOT NULL,actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 request_key uuid NOT NULL,operation text NOT NULL,payload_hash char(64) NOT NULL,result jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,application_id,request_key),
 FOREIGN KEY(application_id,organization_id) REFERENCES applications(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE application_decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,application_id uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN ('approved','declined','request_information','withdrawn')),reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 5 AND 2000),
 actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,actor_membership_id uuid NOT NULL,request_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,application_id,request_key),
 FOREIGN KEY(application_id,organization_id) REFERENCES applications(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(actor_membership_id,actor_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX application_decision_history_idx ON application_decisions(organization_id,application_id,created_at DESC,id);
