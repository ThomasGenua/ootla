-- Native website chat is an in-app persisted channel, independent of external providers.
-- Existing preview channels, conversations, messages and receipts remain unchanged.
ALTER TABLE conversation_channels DROP CONSTRAINT conversation_channels_mode_check;
ALTER TABLE conversation_channels ADD CONSTRAINT conversation_channels_mode_check CHECK(mode IN('simulation','native'));
ALTER TABLE customer_conversations ADD COLUMN mode text NOT NULL DEFAULT 'simulation' CHECK(mode IN('simulation','native'));
ALTER TABLE customer_conversations ADD CONSTRAINT customer_conversations_native_origin_check CHECK(mode<>'native' OR origin='website');
-- Direct responses to a requested native inquiry are distinct from automated follow-up consent.
-- Explicit STOP/withdrawal pauses further replies until the visitor deliberately enables consent.
ALTER TABLE customer_conversations ADD COLUMN responses_paused_at timestamptz;
ALTER TABLE conversation_messages DROP CONSTRAINT conversation_messages_mode_check;
ALTER TABLE conversation_messages ADD CONSTRAINT conversation_messages_mode_check CHECK(mode IN('simulation','native','live_model','not_configured'));
ALTER TABLE conversation_outbox DROP CONSTRAINT conversation_outbox_provider_check;
ALTER TABLE conversation_outbox ADD CONSTRAINT conversation_outbox_provider_check CHECK(provider IN('local_simulator','native_website'));
