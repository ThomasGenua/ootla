-- Conversational hints are actor/thread-bound references, never authorization grants.
ALTER TABLE ask_threads ADD COLUMN resolution_state jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(resolution_state)='object');
ALTER TABLE ask_messages ADD COLUMN choices jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(choices)='array');
ALTER TABLE ask_messages ADD COLUMN resolved_context jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(resolved_context)='object');
ALTER TABLE ask_actions DROP CONSTRAINT ask_actions_kind_check;
ALTER TABLE ask_actions ADD CONSTRAINT ask_actions_kind_check CHECK(kind IN('create_task','update_task'));
