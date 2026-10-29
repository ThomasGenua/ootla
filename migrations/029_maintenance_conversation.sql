-- One canonical Maintenance thread. Existing messages remain unchanged and available as before.
ALTER TABLE maintenance_messages ADD COLUMN channel text NOT NULL DEFAULT 'resident_portal' CHECK(channel IN('resident_portal','email'));
ALTER TABLE maintenance_messages ADD COLUMN delivery_state text CHECK(delivery_state IN('received','queued','available_in_portal','failed','sent','delivered','cancelled'));
ALTER TABLE maintenance_messages ADD CONSTRAINT maintenance_messages_request_identity UNIQUE(id,organization_id,request_id);
CREATE TABLE maintenance_conversation_drafts(
 organization_id uuid NOT NULL,request_id uuid NOT NULL,actor_user_id uuid NOT NULL REFERENCES users(id),
 body text NOT NULL DEFAULT '' CHECK(char_length(body)<=4000),channel text NOT NULL CHECK(channel IN('resident_portal','email')),
 version integer NOT NULL CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,request_id,actor_user_id),
 FOREIGN KEY(request_id,organization_id) REFERENCES maintenance_requests(id,organization_id)
);
-- Extend the existing durable outbox instead of introducing a parallel message store.
ALTER TABLE conversation_outbox ALTER COLUMN conversation_id DROP NOT NULL;
ALTER TABLE conversation_outbox ALTER COLUMN message_id DROP NOT NULL;
ALTER TABLE conversation_outbox ADD COLUMN maintenance_request_id uuid;
ALTER TABLE conversation_outbox ADD COLUMN maintenance_message_id uuid UNIQUE;
ALTER TABLE conversation_outbox ADD COLUMN maintenance_actor_user_id uuid REFERENCES users(id);
ALTER TABLE conversation_outbox ADD COLUMN maintenance_recipient_user_id uuid REFERENCES users(id);
ALTER TABLE conversation_outbox ADD COLUMN maintenance_recipient_contact_id uuid;
ALTER TABLE conversation_outbox ADD COLUMN maintenance_draft_version integer CHECK(maintenance_draft_version>0);
ALTER TABLE conversation_outbox ADD CONSTRAINT conversation_outbox_maintenance_request_fkey FOREIGN KEY(maintenance_request_id,organization_id) REFERENCES maintenance_requests(id,organization_id);
ALTER TABLE conversation_outbox ADD CONSTRAINT conversation_outbox_maintenance_message_fkey FOREIGN KEY(maintenance_message_id,organization_id,maintenance_request_id) REFERENCES maintenance_messages(id,organization_id,request_id);
ALTER TABLE conversation_outbox ADD CONSTRAINT conversation_outbox_maintenance_contact_fkey FOREIGN KEY(maintenance_recipient_contact_id,organization_id) REFERENCES contacts(id,organization_id);
ALTER TABLE conversation_outbox ADD CONSTRAINT conversation_outbox_target_kind CHECK(
 (conversation_id IS NOT NULL AND message_id IS NOT NULL AND maintenance_request_id IS NULL AND maintenance_message_id IS NULL)
 OR (conversation_id IS NULL AND message_id IS NULL AND maintenance_request_id IS NOT NULL AND maintenance_message_id IS NOT NULL
     AND maintenance_actor_user_id IS NOT NULL AND maintenance_recipient_user_id IS NOT NULL AND maintenance_recipient_contact_id IS NOT NULL)
);
ALTER TABLE conversation_outbox DROP CONSTRAINT conversation_outbox_provider_check;
ALTER TABLE conversation_outbox ADD CONSTRAINT conversation_outbox_provider_check CHECK(provider IN('local_simulator','native_website','native_resident_portal'));
ALTER TABLE conversation_outbox DROP CONSTRAINT conversation_outbox_state_check;
ALTER TABLE conversation_outbox ADD CONSTRAINT conversation_outbox_state_check CHECK(state IN('queued','sent','delivered','failed','cancelled','available_in_portal'));
CREATE INDEX conversation_outbox_maintenance_idx ON conversation_outbox(organization_id,maintenance_request_id,created_at,id) WHERE maintenance_message_id IS NOT NULL;
