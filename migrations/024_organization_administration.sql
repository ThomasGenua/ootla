-- Stage26 additive organization controls; no prior identities, credentials or records are rewritten.
CREATE TABLE organization_admin_settings(
 organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
 website text NOT NULL DEFAULT '',contact_email text NOT NULL DEFAULT '',phone text NOT NULL DEFAULT '',address text NOT NULL DEFAULT '',
 time_zone text NOT NULL DEFAULT 'Africa/Lagos',quiet_enabled boolean NOT NULL DEFAULT false,
 quiet_start integer NOT NULL DEFAULT 21 CHECK(quiet_start BETWEEN 0 AND 23),quiet_end integer NOT NULL DEFAULT 8 CHECK(quiet_end BETWEEN 0 AND 23),
 in_app_enabled boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by_user_id uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(char_length(website)<=500 AND char_length(contact_email)<=254 AND char_length(phone)<=80 AND char_length(address)<=500)
);
CREATE TABLE organization_admin_receipts(
 organization_id uuid NOT NULL REFERENCES organizations(id),request_key uuid NOT NULL,actor_user_id uuid NOT NULL REFERENCES users(id),
 operation text NOT NULL,payload_hash char(64) NOT NULL,result jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,request_key)
);
ALTER TABLE organization_assistant_policies ADD COLUMN enabled boolean NOT NULL DEFAULT true;
ALTER TABLE organization_assistant_policies ADD COLUMN public_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE organization_assistant_policies ADD COLUMN operating_rules text NOT NULL DEFAULT '' CHECK(char_length(operating_rules)<=2000);
ALTER TABLE organization_assistant_policies ADD COLUMN permitted_tools text[] NOT NULL DEFAULT ARRAY['native_read','create_task','automation_reminders','portfolio_reporting','resident_operations','book_viewing'];
ALTER TABLE organization_assistant_policies ADD COLUMN permitted_intents text[] NOT NULL DEFAULT ARRAY['property_question','availability','viewing_options','application_checklist','create_follow_up','staff_handoff'];
ALTER TABLE organization_assistant_policies ADD COLUMN max_requests_per_minute integer CHECK(max_requests_per_minute BETWEEN 1 AND 1000);
ALTER TABLE organization_assistant_policies ADD COLUMN max_tokens_per_request integer CHECK(max_tokens_per_request BETWEEN 128 AND 1000000);
ALTER TABLE organization_assistant_policies ADD COLUMN daily_token_budget integer CHECK(daily_token_budget BETWEEN 128 AND 2000000000);
ALTER TABLE organization_assistant_policies ADD COLUMN daily_cost_budget_micros bigint CHECK(daily_cost_budget_micros BETWEEN 0 AND 2000000000);
ALTER TABLE organization_assistant_policies ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE organization_assistant_policies ADD CONSTRAINT organization_ai_tools CHECK(permitted_tools<@ARRAY['native_read','create_task','automation_reminders','portfolio_reporting','resident_operations','book_viewing']::text[]);
ALTER TABLE organization_assistant_policies ADD CONSTRAINT organization_ai_intents CHECK(permitted_intents<@ARRAY['property_question','availability','viewing_options','application_checklist','create_follow_up','staff_handoff']::text[]);
ALTER TABLE ai_knowledge ALTER COLUMN property_id DROP NOT NULL;
CREATE INDEX ai_knowledge_organization_scope_idx ON ai_knowledge(organization_id,status,updated_at DESC,id) WHERE property_id IS NULL;

CREATE TABLE lead_routing_rules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),property_id uuid NOT NULL,team_id uuid,strategy text NOT NULL DEFAULT 'manual' CHECK(strategy IN ('manual','least_open_leads')),enabled boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by_user_id uuid NOT NULL REFERENCES users(id),UNIQUE(organization_id,property_id),FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),FOREIGN KEY(team_id,organization_id) REFERENCES task_teams(id,organization_id));
