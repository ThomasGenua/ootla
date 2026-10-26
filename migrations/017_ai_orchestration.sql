-- Stage19: approved property knowledge and bounded operational AI requests. No general document indexing.
CREATE TABLE ai_knowledge(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 160),
 body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 4000),status text NOT NULL CHECK(status IN ('draft','approved','retired')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),approved_at timestamptz,approved_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,updated_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id),FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT,
 CHECK(status<>'approved' OR approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL)
);
CREATE INDEX ai_knowledge_scope_idx ON ai_knowledge(organization_id,property_id,status,updated_at DESC,id);
CREATE TABLE ai_knowledge_receipts(
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,request_key uuid NOT NULL,actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 operation text NOT NULL,payload_hash char(64) NOT NULL,knowledge_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,request_key),
 FOREIGN KEY(knowledge_id,organization_id) REFERENCES ai_knowledge(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE ai_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 actor_membership_id uuid NOT NULL,application_id uuid,lead_id uuid,request_key uuid NOT NULL,payload_hash char(64) NOT NULL,intent text NOT NULL CHECK(intent IN ('property_question','availability','viewing_options','application_checklist','create_follow_up','staff_handoff')),
 mode text NOT NULL CHECK(mode IN ('simulated','live','not_configured')),status text NOT NULL CHECK(status IN ('running','completed','failed','refused','handoff')),
 reserved_tokens integer NOT NULL CHECK(reserved_tokens>=0),reserved_cost_micros bigint NOT NULL CHECK(reserved_cost_micros>=0),
 input_tokens integer NOT NULL DEFAULT 0 CHECK(input_tokens>=0),output_tokens integer NOT NULL DEFAULT 0 CHECK(output_tokens>=0),cost_micros bigint NOT NULL DEFAULT 0 CHECK(cost_micros>=0),usage_estimated boolean NOT NULL DEFAULT true,
 result jsonb,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,expires_at timestamptz NOT NULL,
 UNIQUE(organization_id,actor_user_id,request_key),UNIQUE(id,organization_id),
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(application_id,organization_id) REFERENCES applications(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(actor_membership_id,actor_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX ai_request_window_idx ON ai_requests(organization_id,created_at DESC);
CREATE TABLE ai_operational_traces(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,request_id uuid NOT NULL UNIQUE,source_ids text[] NOT NULL DEFAULT '{}',
 tools jsonb NOT NULL CHECK(jsonb_typeof(tools)='array'),reason text NOT NULL CHECK(char_length(reason)<=300),latency_ms integer NOT NULL CHECK(latency_ms>=0),
 created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(request_id,organization_id) REFERENCES ai_requests(id,organization_id) ON DELETE RESTRICT
);
