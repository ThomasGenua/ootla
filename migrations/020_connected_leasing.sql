ALTER TABLE conversations ADD COLUMN snoozed_until timestamptz;
ALTER TABLE conversations ADD COLUMN response_due_at timestamptz;
ALTER TABLE conversation_messages ADD COLUMN tour_id uuid REFERENCES viewings(id);
ALTER TABLE conversation_messages ADD COLUMN tour_version integer;
ALTER TABLE conversation_messages ADD CONSTRAINT conversation_tour_context CHECK((tour_id IS NULL)=(tour_version IS NULL));
CREATE TABLE conversation_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 conversation_id uuid NOT NULL, author_id uuid NOT NULL REFERENCES users(id),
 request_key uuid NOT NULL, body text NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,request_key),
 FOREIGN KEY(conversation_id,organization_id) REFERENCES conversations(id,organization_id)
);
CREATE TABLE conversation_mentions (
 note_id uuid NOT NULL REFERENCES conversation_notes(id),
 membership_id uuid NOT NULL REFERENCES organization_memberships(id), read_at timestamptz,
 PRIMARY KEY(note_id,membership_id)
);
CREATE TABLE conversation_composers (
 conversation_id uuid PRIMARY KEY REFERENCES conversations(id),
 membership_id uuid NOT NULL REFERENCES organization_memberships(id),
 client_id uuid NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX conversation_notes_timeline ON conversation_notes(conversation_id,created_at DESC,id);
CREATE INDEX conversation_mentions_unread ON conversation_mentions(membership_id,note_id) WHERE read_at IS NULL;
