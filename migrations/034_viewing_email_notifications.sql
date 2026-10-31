-- Keep viewing-email drafts/status on the existing durable notification record.
ALTER TABLE viewing_notification_receipts
 ADD COLUMN email_requested boolean NOT NULL DEFAULT false,
 ADD COLUMN email_state text NOT NULL DEFAULT 'not_requested' CHECK(email_state IN('not_requested','draft','unavailable','preview_processed')),
 ADD COLUMN contact_id uuid,
 ADD COLUMN email_payload jsonb,
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
 ADD CONSTRAINT viewing_notification_contact_fk FOREIGN KEY(contact_id,organization_id) REFERENCES contacts(id,organization_id),
 ADD CONSTRAINT viewing_notification_email_shape CHECK(
  (NOT email_requested AND email_state='not_requested' AND contact_id IS NULL AND email_payload IS NULL)
  OR (email_requested AND email_state<>'not_requested' AND contact_id IS NOT NULL AND jsonb_typeof(email_payload)='object')
 );
ALTER TABLE viewing_events ADD CONSTRAINT viewing_events_tenant_viewing_key UNIQUE(id,organization_id,viewing_id);
ALTER TABLE conversation_outbox ADD COLUMN viewing_id uuid, ADD COLUMN viewing_event_id uuid UNIQUE, ADD COLUMN viewing_contact_id uuid;
ALTER TABLE conversation_outbox ADD CONSTRAINT conversation_outbox_viewing_event_fk FOREIGN KEY(viewing_event_id,organization_id,viewing_id) REFERENCES viewing_events(id,organization_id,viewing_id);
ALTER TABLE conversation_outbox ADD CONSTRAINT conversation_outbox_viewing_contact_fk FOREIGN KEY(viewing_contact_id,organization_id) REFERENCES contacts(id,organization_id);
ALTER TABLE conversation_outbox DROP CONSTRAINT conversation_outbox_target_kind;
ALTER TABLE conversation_outbox ADD CONSTRAINT conversation_outbox_target_kind CHECK(
 (viewing_id IS NULL AND viewing_event_id IS NULL AND viewing_contact_id IS NULL AND (
  (conversation_id IS NOT NULL AND message_id IS NOT NULL AND maintenance_request_id IS NULL AND maintenance_message_id IS NULL AND task_id IS NULL AND task_event_id IS NULL AND task_contact_id IS NULL)
  OR (conversation_id IS NULL AND message_id IS NULL AND maintenance_request_id IS NOT NULL AND maintenance_message_id IS NOT NULL AND maintenance_actor_user_id IS NOT NULL AND maintenance_recipient_user_id IS NOT NULL AND maintenance_recipient_contact_id IS NOT NULL AND task_id IS NULL AND task_event_id IS NULL AND task_contact_id IS NULL)
  OR (conversation_id IS NULL AND message_id IS NULL AND maintenance_request_id IS NULL AND maintenance_message_id IS NULL AND task_id IS NOT NULL AND task_event_id IS NOT NULL AND task_contact_id IS NOT NULL AND origin='staff')
 ))
 OR (viewing_id IS NOT NULL AND viewing_event_id IS NOT NULL AND viewing_contact_id IS NOT NULL AND origin='staff' AND conversation_id IS NULL AND message_id IS NULL AND maintenance_request_id IS NULL AND maintenance_message_id IS NULL AND task_id IS NULL AND task_event_id IS NULL AND task_contact_id IS NULL)
);
CREATE INDEX conversation_outbox_viewing_idx ON conversation_outbox(organization_id,viewing_id,created_at,id) WHERE viewing_event_id IS NOT NULL;
