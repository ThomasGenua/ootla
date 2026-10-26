-- Stage 03 adds synthetic portfolio fixtures without replacing identities or prior migrations.
ALTER TABLE users ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
UPDATE users u SET is_demo = true WHERE u.email = 'admin@demo.ootla.test'
 AND EXISTS (SELECT 1 FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
             WHERE m.user_id=u.id AND o.environment='demo');
ALTER TABLE properties ADD COLUMN address text NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN city text NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN property_type text NOT NULL DEFAULT 'residential';
ALTER TABLE properties ADD COLUMN seed_key text;
ALTER TABLE properties ADD CONSTRAINT properties_demo_seed_key UNIQUE (organization_id, seed_key);
CREATE TABLE units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 property_id uuid NOT NULL, label text NOT NULL, bedrooms integer NOT NULL CHECK (bedrooms>=0),
 status text NOT NULL CHECK (status IN ('available','reserved','occupied')), monthly_rent numeric(12,2) NOT NULL CHECK(monthly_rent>=0),
 seed_key text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id,property_id), UNIQUE(organization_id,seed_key), UNIQUE(property_id,label),
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX units_organization_property_idx ON units(organization_id,property_id);
CREATE TABLE leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 property_id uuid NOT NULL, unit_id uuid, display_name text NOT NULL, email text NOT NULL CHECK(email=lower(btrim(email))),
 status text NOT NULL CHECK(status IN ('new','contacted','viewing_scheduled','qualified')),
 intent text NOT NULL CHECK(intent IN ('leasing','sales')), notes text NOT NULL DEFAULT '', seed_key text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id,property_id), UNIQUE(organization_id,seed_key),
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(unit_id,organization_id,property_id) REFERENCES units(id,organization_id,property_id) ON DELETE RESTRICT
);
CREATE INDEX leads_organization_property_idx ON leads(organization_id,property_id);
CREATE TABLE tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 property_id uuid NOT NULL, lead_id uuid NOT NULL, title text NOT NULL, due_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('open','completed')), seed_key text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,seed_key),
 FOREIGN KEY(lead_id,organization_id,property_id) REFERENCES leads(id,organization_id,property_id) ON DELETE RESTRICT
);
CREATE INDEX tasks_organization_property_idx ON tasks(organization_id,property_id);
CREATE TABLE viewings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 property_id uuid NOT NULL, lead_id uuid NOT NULL, unit_id uuid, starts_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('scheduled','completed','cancelled')), seed_key text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,seed_key),
 FOREIGN KEY(lead_id,organization_id,property_id) REFERENCES leads(id,organization_id,property_id) ON DELETE RESTRICT,
 FOREIGN KEY(unit_id,organization_id,property_id) REFERENCES units(id,organization_id,property_id) ON DELETE RESTRICT
);
CREATE INDEX viewings_organization_property_idx ON viewings(organization_id,property_id);
CREATE TABLE lead_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 property_id uuid NOT NULL, lead_id uuid NOT NULL, kind text NOT NULL, summary text NOT NULL,
 occurred_at timestamptz NOT NULL, simulated boolean NOT NULL DEFAULT true CHECK(simulated=true), seed_key text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,seed_key),
 FOREIGN KEY(lead_id,organization_id,property_id) REFERENCES leads(id,organization_id,property_id) ON DELETE RESTRICT
);
CREATE INDEX lead_activities_organization_property_idx ON lead_activities(organization_id,property_id);
-- Ownership manifest protects unrelated records and keeps seed/reset scoped to this dataset.
CREATE TABLE demo_seed_records (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 entity_type text NOT NULL CHECK(entity_type IN ('properties','units','leads','tasks','viewings','lead_activities')),
 seed_key text NOT NULL CHECK(seed_key LIKE 'stage03.%'), record_id uuid NOT NULL,
 PRIMARY KEY(organization_id,entity_type,seed_key), UNIQUE(entity_type,record_id)
);
