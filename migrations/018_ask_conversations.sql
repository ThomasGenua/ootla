-- Stage20: actor-bound Ask Ootla, scoped customer channels and durable local conversation outbox.
CREATE TABLE ask_threads(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),actor_user_id uuid NOT NULL REFERENCES users(id),
 actor_membership_id uuid NOT NULL,property_id uuid,lead_id uuid,application_id uuid,page text NOT NULL,title text NOT NULL DEFAULT 'Ask Ootla',
 request_key uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id),UNIQUE(organization_id,actor_user_id,request_key),
 FOREIGN KEY(actor_membership_id,actor_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id),
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),
 FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id),
 FOREIGN KEY(application_id,organization_id) REFERENCES applications(id,organization_id)
);
CREATE INDEX ask_threads_actor_idx ON ask_threads(organization_id,actor_user_id,updated_at DESC,id);
CREATE TABLE ask_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,thread_id uuid NOT NULL,request_key uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('staff','assistant')),body text NOT NULL CHECK(char_length(body)<=6000),mode text NOT NULL DEFAULT 'simulated' CHECK(mode IN('simulated','live','not_configured')),
 status text NOT NULL DEFAULT 'completed' CHECK(status IN('completed','failed','handoff','queued')),sources jsonb NOT NULL DEFAULT '[]',payload_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,organization_id),UNIQUE(thread_id,request_key,role),
 FOREIGN KEY(thread_id,organization_id) REFERENCES ask_threads(id,organization_id)
);
CREATE INDEX ask_messages_thread_idx ON ask_messages(thread_id,created_at,id);
CREATE TABLE ask_actions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,thread_id uuid NOT NULL,message_id uuid NOT NULL,kind text NOT NULL CHECK(kind='create_task'),
 preview jsonb NOT NULL,status text NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','completed','failed')),task_id uuid,confirmed_by_user_id uuid REFERENCES users(id),confirmed_at timestamptz,
 UNIQUE(message_id),FOREIGN KEY(thread_id,organization_id) REFERENCES ask_threads(id,organization_id),FOREIGN KEY(message_id,organization_id) REFERENCES ask_messages(id,organization_id),
 FOREIGN KEY(task_id,organization_id) REFERENCES tasks(id,organization_id)
);
CREATE TABLE conversation_channels(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,label text NOT NULL,enabled boolean NOT NULL DEFAULT false,
 published_by_user_id uuid NOT NULL REFERENCES users(id),published_by_membership_id uuid NOT NULL,time_zone text NOT NULL DEFAULT 'Africa/Lagos',
 quiet_start integer NOT NULL DEFAULT 21 CHECK(quiet_start BETWEEN 0 AND 23),quiet_end integer NOT NULL DEFAULT 8 CHECK(quiet_end BETWEEN 0 AND 23),
 mode text NOT NULL DEFAULT 'simulation' CHECK(mode='simulation'),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id),UNIQUE(organization_id,property_id),FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),
 FOREIGN KEY(published_by_membership_id,published_by_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id)
);
CREATE TABLE customer_conversations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,channel_id uuid NOT NULL,lead_id uuid NOT NULL,contact_id uuid NOT NULL,
 origin text NOT NULL CHECK(origin IN('website','simulator','resident','voice')),ownership text NOT NULL DEFAULT 'ai_active' CHECK(ownership IN('ai_active','staff_requested','staff_handling')),
 consent boolean NOT NULL DEFAULT false,preferences jsonb NOT NULL DEFAULT '{}',request_key uuid NOT NULL,payload_hash text NOT NULL,
 session_digest char(64) NOT NULL UNIQUE,expires_at timestamptz NOT NULL,booking_token_encrypted text,booked_viewing_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id),UNIQUE(channel_id,request_key),
 FOREIGN KEY(channel_id,organization_id) REFERENCES conversation_channels(id,organization_id),
 FOREIGN KEY(lead_id,organization_id,property_id,contact_id) REFERENCES leads(id,organization_id,property_id,contact_id),
 FOREIGN KEY(booked_viewing_id,organization_id) REFERENCES viewings(id,organization_id)
);
CREATE INDEX conversations_directory_idx ON customer_conversations(organization_id,property_id,updated_at DESC,id);
CREATE TABLE conversation_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,conversation_id uuid NOT NULL,request_key uuid NOT NULL,
 role text NOT NULL CHECK(role IN('customer','assistant','staff','internal_note','draft','system')),
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 6000),status text NOT NULL CHECK(status IN('received','proposed','queued','sent','delivered','failed','cancelled')),
 mode text NOT NULL DEFAULT 'simulation' CHECK(mode IN('simulation','live_model','not_configured')),
 sources jsonb NOT NULL DEFAULT '[]',payload_hash text NOT NULL,actor_user_id uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,organization_id),UNIQUE(conversation_id,request_key,role),FOREIGN KEY(conversation_id,organization_id) REFERENCES customer_conversations(id,organization_id)
);
CREATE INDEX conversation_messages_thread_idx ON conversation_messages(conversation_id,created_at,id);
CREATE TABLE conversation_outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,conversation_id uuid NOT NULL,message_id uuid NOT NULL UNIQUE,
 origin text NOT NULL CHECK(origin IN('ai','staff','automation')),state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','sent','delivered','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),next_attempt_at timestamptz NOT NULL DEFAULT now(),last_error text,
 provider text NOT NULL DEFAULT 'local_simulator' CHECK(provider='local_simulator'),provider_message_id text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(conversation_id,organization_id) REFERENCES customer_conversations(id,organization_id),FOREIGN KEY(message_id,organization_id) REFERENCES conversation_messages(id,organization_id)
);
CREATE INDEX conversation_outbox_due_idx ON conversation_outbox(state,next_attempt_at,id);
CREATE TABLE conversation_action_receipts(
 organization_id uuid NOT NULL REFERENCES organizations(id),actor_scope text NOT NULL,request_key uuid NOT NULL,operation text NOT NULL,payload_hash text NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,actor_scope,request_key)
);
CREATE TABLE conversation_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,conversation_id uuid NOT NULL,kind text NOT NULL,summary text NOT NULL,metadata jsonb NOT NULL DEFAULT '{}',
 actor_user_id uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(conversation_id,organization_id) REFERENCES customer_conversations(id,organization_id)
);
CREATE INDEX conversation_events_scope_idx ON conversation_events(organization_id,conversation_id,created_at DESC,id);
-- New event kinds are additive and retain all historical private events.
ALTER TABLE lead_workspace_events DROP CONSTRAINT lead_workspace_events_kind_check;
ALTER TABLE lead_workspace_events ADD CONSTRAINT lead_workspace_events_kind_check CHECK(kind IN('note','call','task_created','task_updated','document_uploaded','staff_decision','conversation'));

-- Approved staff knowledge is private by default; public reuse needs an explicit separate approval.
ALTER TABLE ai_knowledge ADD COLUMN public_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE conversation_outbox ADD COLUMN requested_response boolean NOT NULL DEFAULT false;

CREATE TABLE organization_assistant_policies(organization_id uuid PRIMARY KEY REFERENCES organizations(id),allow_task_creation boolean NOT NULL DEFAULT true,mutation_confirmation text NOT NULL DEFAULT 'always' CHECK(mutation_confirmation='always'),updated_by_user_id uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now());
