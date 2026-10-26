-- Stage25: optional local transcript playback, disabled until explicit organization configuration.
CREATE TABLE organization_voice_settings(
 organization_id uuid PRIMARY KEY REFERENCES organizations(id),enabled boolean NOT NULL DEFAULT false,
 retention_days integer NOT NULL DEFAULT 0 CHECK(retention_days BETWEEN 0 AND 30),consent_required boolean NOT NULL DEFAULT false,
 consent_notice text,recording_enabled boolean NOT NULL DEFAULT false CHECK(recording_enabled=false),
 version integer NOT NULL DEFAULT 1,configured_by_user_id uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(NOT consent_required OR consent_notice IS NOT NULL AND char_length(btrim(consent_notice)) BETWEEN 1 AND 1200)
);
CREATE TABLE voice_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,
 conversation_id uuid NOT NULL,lead_id uuid NOT NULL,contact_id uuid NOT NULL,
 started_by_user_id uuid NOT NULL REFERENCES users(id),started_by_membership_id uuid NOT NULL,
 request_key uuid NOT NULL,payload_hash char(64) NOT NULL,scenario text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','interrupted','awaiting_staff','completed','timed_out','failed')),
 outcome text NOT NULL DEFAULT 'started',summary text NOT NULL DEFAULT 'Local transcript-playback session started; no call or audio recording exists.',
 generation integer NOT NULL DEFAULT 1,policy_version integer NOT NULL,retention_days integer NOT NULL CHECK(retention_days BETWEEN 0 AND 30),consent_accepted boolean NOT NULL DEFAULT false,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),last_event_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,ended_at timestamptz,
 transcript_deleted_at timestamptz,verified_application_id uuid,verified_applicant_user_id uuid REFERENCES users(id),
 verified_participant_id uuid,verified_applicant_session_digest char(64),
 UNIQUE(id,organization_id),UNIQUE(organization_id,request_key),UNIQUE(conversation_id),
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),
 FOREIGN KEY(conversation_id,organization_id) REFERENCES customer_conversations(id,organization_id),
 FOREIGN KEY(lead_id,organization_id,property_id,contact_id) REFERENCES leads(id,organization_id,property_id,contact_id),
 FOREIGN KEY(started_by_membership_id,started_by_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id),
 FOREIGN KEY(verified_application_id,organization_id) REFERENCES applications(id,organization_id),
 CHECK(expires_at>started_at)
);
CREATE INDEX voice_sessions_directory_idx ON voice_sessions(organization_id,property_id,started_at DESC,id);
CREATE INDEX voice_sessions_timeout_idx ON voice_sessions(expires_at,last_event_at,id) WHERE status IN('active','interrupted');
CREATE TABLE voice_transcripts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,session_id uuid NOT NULL,request_key uuid NOT NULL,kind text NOT NULL,
 input_text text,output_text text,private boolean NOT NULL DEFAULT false,
 recognition text NOT NULL,dialogue text NOT NULL,tool text NOT NULL,output_state text NOT NULL,handoff text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz,
 UNIQUE(session_id,request_key),FOREIGN KEY(session_id,organization_id) REFERENCES voice_sessions(id,organization_id),
 CHECK(input_text IS NULL OR char_length(input_text)<=1500),CHECK(output_text IS NULL OR char_length(output_text)<=6000)
);
CREATE INDEX voice_transcripts_history_idx ON voice_transcripts(organization_id,session_id,created_at,id);
CREATE INDEX voice_transcripts_retention_idx ON voice_transcripts(expires_at,id) WHERE input_text IS NOT NULL OR output_text IS NOT NULL;
CREATE TABLE voice_action_receipts(
 organization_id uuid NOT NULL,session_id uuid NOT NULL,request_key uuid NOT NULL,actor_user_id uuid NOT NULL REFERENCES users(id),
 operation text NOT NULL,payload_hash char(64) NOT NULL,state text NOT NULL CHECK(state IN('processing','completed','failed')),
 result jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,session_id,request_key),FOREIGN KEY(session_id,organization_id) REFERENCES voice_sessions(id,organization_id)
);
CREATE TABLE voice_settings_receipts(
 organization_id uuid NOT NULL REFERENCES organizations(id),request_key uuid NOT NULL,actor_user_id uuid NOT NULL REFERENCES users(id),
 payload_hash char(64) NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,request_key)
);
