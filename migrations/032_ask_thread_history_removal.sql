-- Removing staff history is an owned-thread tombstone, not deletion of CRM records or operational evidence.
ALTER TABLE ask_threads ADD COLUMN deleted_at timestamptz;
CREATE INDEX ask_threads_visible_history_idx ON ask_threads(organization_id,actor_user_id,actor_membership_id,updated_at DESC,id) WHERE deleted_at IS NULL AND retention_expired_at IS NULL;