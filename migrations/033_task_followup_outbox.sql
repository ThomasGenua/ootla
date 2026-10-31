-- Task correspondence uses its existing private task event and the shared durable outbox.
ALTER TABLE task_events ADD CONSTRAINT task_events_tenant_task_key UNIQUE(id,organization_id,task_id);
ALTER TABLE conversation_outbox ADD COLUMN task_id uuid;
ALTER TABLE conversation_outbox ADD COLUMN task_event_id uuid UNIQUE;
ALTER TABLE conversation_outbox ADD COLUMN task_contact_id uuid;
ALTER TABLE conversation_outbox ADD CONSTRAINT conversation_outbox_task_event_fkey FOREIGN KEY(task_event_id,organization_id,task_id) REFERENCES task_events(id,organization_id,task_id);
ALTER TABLE conversation_outbox ADD CONSTRAINT conversation_outbox_task_contact_fkey FOREIGN KEY(task_contact_id,organization_id) REFERENCES contacts(id,organization_id);
ALTER TABLE conversation_outbox DROP CONSTRAINT conversation_outbox_target_kind;
ALTER TABLE conversation_outbox ADD CONSTRAINT conversation_outbox_target_kind CHECK(
 (conversation_id IS NOT NULL AND message_id IS NOT NULL AND maintenance_request_id IS NULL AND maintenance_message_id IS NULL AND task_id IS NULL AND task_event_id IS NULL AND task_contact_id IS NULL)
 OR (conversation_id IS NULL AND message_id IS NULL AND maintenance_request_id IS NOT NULL AND maintenance_message_id IS NOT NULL AND maintenance_actor_user_id IS NOT NULL AND maintenance_recipient_user_id IS NOT NULL AND maintenance_recipient_contact_id IS NOT NULL AND task_id IS NULL AND task_event_id IS NULL AND task_contact_id IS NULL)
 OR (conversation_id IS NULL AND message_id IS NULL AND maintenance_request_id IS NULL AND maintenance_message_id IS NULL AND task_id IS NOT NULL AND task_event_id IS NOT NULL AND task_contact_id IS NOT NULL AND origin='staff')
);
CREATE INDEX conversation_outbox_task_idx ON conversation_outbox(organization_id,task_id,created_at,id) WHERE task_event_id IS NOT NULL;
