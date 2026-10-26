-- Stage26 private Ootla-owned property sources. Binary content is never a public asset or automatically indexed.
CREATE TABLE property_knowledge_documents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),property_id uuid NOT NULL,
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 180),media_type text NOT NULL,size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 2097152),
 sha256 char(64) NOT NULL,content bytea,title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 160),reviewed_text text NOT NULL DEFAULT '' CHECK(char_length(reviewed_text)<=4000),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','retired')),public_enabled boolean NOT NULL DEFAULT false,
 knowledge_id uuid,version integer NOT NULL DEFAULT 1 CHECK(version>0),approved_at timestamptz,retired_at timestamptz,retention_expired_at timestamptz,
 created_by_user_id uuid NOT NULL REFERENCES users(id),updated_by_user_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),FOREIGN KEY(knowledge_id,organization_id) REFERENCES ai_knowledge(id,organization_id),
 UNIQUE(id,organization_id),UNIQUE(knowledge_id),CHECK(content IS NULL OR octet_length(content)=size_bytes),CHECK(status<>'approved' OR approved_at IS NOT NULL AND knowledge_id IS NOT NULL AND char_length(reviewed_text)>0)
);
CREATE INDEX property_knowledge_documents_scope_idx ON property_knowledge_documents(organization_id,property_id,status,updated_at DESC,id);
