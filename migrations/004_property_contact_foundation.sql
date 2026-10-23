-- Stage 06: additive property/contact foundation. Preserve prior rows and migrations.
-- Organization mode describes record ownership, not an activated provider connection.
CREATE TABLE organization_data_settings (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 mode text NOT NULL DEFAULT 'standalone' CHECK(mode IN ('standalone','yardi_connected')),
 yardi_owned_fields jsonb NOT NULL DEFAULT '{"property":["name","address","city","type"],"unit":["label","bedrooms","status","monthlyRent","availabilitySource","lastVerifiedAt"],"contact":["displayName","email","phone"],"application":["contactId","householdId","propertyId","unitId","leadId","status"],"lease":["contactId","householdId","propertyId","unitId","applicationId","leadId","status","startsOn","endsOn"]}'::jsonb CHECK(jsonb_typeof(yardi_owned_fields)='object'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO organization_data_settings(organization_id) SELECT id FROM organizations;
CREATE TABLE property_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 200), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id), UNIQUE(organization_id,name)
);
ALTER TABLE properties ADD COLUMN group_id uuid;
ALTER TABLE properties ADD COLUMN source_system text NOT NULL DEFAULT 'local' CHECK(source_system IN ('local','demo','import','yardi'));
ALTER TABLE properties ADD COLUMN source_owned_fields text[] NOT NULL DEFAULT '{}' CHECK(source_owned_fields <@ ARRAY['name','address','city','type','groupId']::text[]);
ALTER TABLE properties ADD CONSTRAINT properties_group_tenant_fkey FOREIGN KEY(group_id,organization_id) REFERENCES property_groups(id,organization_id) ON DELETE RESTRICT;
UPDATE properties SET source_system='demo' WHERE seed_key LIKE 'stage03.%';
ALTER TABLE units ADD CONSTRAINT units_id_organization_key UNIQUE(id,organization_id);
ALTER TABLE units ADD COLUMN source_system text NOT NULL DEFAULT 'local' CHECK(source_system IN ('local','demo','import','yardi'));
ALTER TABLE units ADD COLUMN source_owned_fields text[] NOT NULL DEFAULT '{}' CHECK(source_owned_fields <@ ARRAY['label','bedrooms','status','monthlyRent','availabilitySource','lastVerifiedAt']::text[]);
ALTER TABLE units ADD COLUMN availability_source text NOT NULL DEFAULT 'unknown' CHECK(availability_source IN ('unknown','staff_reported','demo','import','yardi'));
ALTER TABLE units ADD COLUMN availability_verified_at timestamptz;
UPDATE units SET source_system='demo', availability_source='demo' WHERE seed_key LIKE 'stage03.%';
-- Existing created_at is not a verification event. Leave every legacy verification NULL.
CREATE INDEX properties_directory_city_idx ON properties(organization_id,city,name,id);
CREATE INDEX properties_directory_group_idx ON properties(organization_id,group_id,name,id);
CREATE INDEX properties_directory_source_idx ON properties(organization_id,source_system,name,id);
CREATE INDEX units_availability_idx ON units(organization_id,property_id,status);

CREATE TABLE contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 display_name text NOT NULL CHECK(char_length(btrim(display_name)) BETWEEN 1 AND 200),
 email text NOT NULL DEFAULT '' CHECK(email=lower(btrim(email)) AND char_length(email)<=254), phone text NOT NULL DEFAULT '',
 source_system text NOT NULL DEFAULT 'local' CHECK(source_system IN ('local','demo','import','yardi')),
 source_owned_fields text[] NOT NULL DEFAULT '{}' CHECK(source_owned_fields <@ ARRAY['displayName','email','phone']::text[]),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,organization_id)
);
-- Email is intentionally not unique: shared addresses are not proof of identity.
CREATE INDEX contacts_directory_idx ON contacts(organization_id,display_name,id);
CREATE INDEX contacts_email_lookup_idx ON contacts(organization_id,email);
CREATE TABLE contact_property_links (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, contact_id uuid NOT NULL, property_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(contact_id,organization_id,property_id),
 FOREIGN KEY(contact_id,organization_id) REFERENCES contacts(id,organization_id) ON DELETE CASCADE,
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX contact_links_property_idx ON contact_property_links(organization_id,property_id,contact_id);
CREATE TABLE households (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 200), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,organization_id)
);
CREATE TABLE household_property_links (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, household_id uuid NOT NULL, property_id uuid NOT NULL,
 PRIMARY KEY(household_id,organization_id,property_id),
 FOREIGN KEY(household_id,organization_id) REFERENCES households(id,organization_id) ON DELETE CASCADE,
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE household_members (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, household_id uuid NOT NULL, contact_id uuid NOT NULL,
 relationship text NOT NULL DEFAULT 'member' CHECK(char_length(btrim(relationship)) BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(household_id,contact_id,organization_id),
 FOREIGN KEY(household_id,organization_id) REFERENCES households(id,organization_id) ON DELETE CASCADE,
 FOREIGN KEY(contact_id,organization_id) REFERENCES contacts(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX household_members_contact_idx ON household_members(organization_id,contact_id,household_id);
-- Safely give each prior lead an explicit canonical identity without merging on email.
ALTER TABLE leads ADD COLUMN contact_id uuid;
INSERT INTO contacts(id,organization_id,display_name,email,source_system,created_at,updated_at)
 SELECT id,organization_id,display_name,email,CASE WHEN seed_key LIKE 'stage03.%' THEN 'demo' ELSE 'local' END,created_at,updated_at FROM leads;
INSERT INTO contact_property_links(organization_id,contact_id,property_id)
 SELECT organization_id,id,property_id FROM leads;
UPDATE leads SET contact_id=id;
ALTER TABLE leads ALTER COLUMN contact_id SET NOT NULL;
ALTER TABLE leads ADD CONSTRAINT leads_contact_property_tenant_fkey FOREIGN KEY(contact_id,organization_id,property_id) REFERENCES contact_property_links(contact_id,organization_id,property_id) ON DELETE RESTRICT;
ALTER TABLE leads ADD CONSTRAINT leads_contact_relationship_key UNIQUE(id,organization_id,property_id,contact_id);
CREATE INDEX leads_contact_history_idx ON leads(organization_id,contact_id,created_at DESC);
-- Compatibility with retained explicit Stage 03 seed and old lead insertion code.
-- Supplying contact_id reuses the identity; omitting it creates one distinct identity.
CREATE FUNCTION ootla_ensure_lead_contact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.contact_id IS NULL AND NEW.seed_key IS NOT NULL THEN
  -- ON CONFLICT still executes BEFORE INSERT triggers. Reuse an existing seed
  -- identity first; serialize same-key seeds so repeat/concurrent seeds cannot
  -- leave orphan contacts when their lead insert becomes DO NOTHING.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text || ':' || NEW.seed_key,0));
  SELECT contact_id INTO NEW.contact_id FROM leads WHERE organization_id=NEW.organization_id AND seed_key=NEW.seed_key;
 END IF;
 IF NEW.contact_id IS NULL THEN
  INSERT INTO contacts(organization_id,display_name,email,source_system)
   VALUES(NEW.organization_id,NEW.display_name,NEW.email,CASE WHEN NEW.seed_key LIKE 'stage03.%' THEN 'demo' ELSE 'local' END) RETURNING id INTO NEW.contact_id;
  INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES(NEW.organization_id,NEW.contact_id,NEW.property_id);
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER leads_ensure_contact BEFORE INSERT ON leads FOR EACH ROW EXECUTE FUNCTION ootla_ensure_lead_contact();

CREATE TABLE applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 contact_id uuid NOT NULL, household_id uuid, property_id uuid NOT NULL, unit_id uuid, lead_id uuid,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','staff_review')),
 source_system text NOT NULL DEFAULT 'local' CHECK(source_system IN ('local','demo','import','yardi')),
 source_owned_fields text[] NOT NULL DEFAULT '{}' CHECK(source_owned_fields <@ ARRAY['contactId','householdId','propertyId','unitId','leadId','status']::text[]),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id), UNIQUE(id,organization_id,property_id,contact_id),
 FOREIGN KEY(contact_id,organization_id,property_id) REFERENCES contact_property_links(contact_id,organization_id,property_id) ON DELETE RESTRICT,
 FOREIGN KEY(household_id,organization_id,property_id) REFERENCES household_property_links(household_id,organization_id,property_id) ON DELETE RESTRICT,
 FOREIGN KEY(household_id,contact_id,organization_id) REFERENCES household_members(household_id,contact_id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(unit_id,organization_id,property_id) REFERENCES units(id,organization_id,property_id) ON DELETE RESTRICT,
 FOREIGN KEY(lead_id,organization_id,property_id,contact_id) REFERENCES leads(id,organization_id,property_id,contact_id) ON DELETE RESTRICT
);
CREATE INDEX applications_contact_history_idx ON applications(organization_id,contact_id,created_at DESC);
CREATE TABLE leases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 contact_id uuid NOT NULL, household_id uuid, property_id uuid NOT NULL, unit_id uuid, application_id uuid, lead_id uuid,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','ended')), starts_on date, ends_on date,
 source_system text NOT NULL DEFAULT 'local' CHECK(source_system IN ('local','demo','import','yardi')),
 source_owned_fields text[] NOT NULL DEFAULT '{}' CHECK(source_owned_fields <@ ARRAY['contactId','householdId','propertyId','unitId','applicationId','leadId','status','startsOn','endsOn']::text[]),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,organization_id),
 CHECK(starts_on IS NULL OR ends_on IS NULL OR ends_on>=starts_on),
 FOREIGN KEY(contact_id,organization_id,property_id) REFERENCES contact_property_links(contact_id,organization_id,property_id) ON DELETE RESTRICT,
 FOREIGN KEY(household_id,organization_id,property_id) REFERENCES household_property_links(household_id,organization_id,property_id) ON DELETE RESTRICT,
 FOREIGN KEY(household_id,contact_id,organization_id) REFERENCES household_members(household_id,contact_id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(unit_id,organization_id,property_id) REFERENCES units(id,organization_id,property_id) ON DELETE RESTRICT,
 FOREIGN KEY(application_id,organization_id,property_id,contact_id) REFERENCES applications(id,organization_id,property_id,contact_id) ON DELETE RESTRICT,
 FOREIGN KEY(lead_id,organization_id,property_id,contact_id) REFERENCES leads(id,organization_id,property_id,contact_id) ON DELETE RESTRICT
);
CREATE INDEX leases_contact_history_idx ON leases(organization_id,contact_id,created_at DESC);
-- Typed nullable references keep every external ID in one dedicated registry,
-- with real tenant foreign keys rather than an unchecked polymorphic entity_id.
CREATE TABLE external_record_mappings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 entity_type text NOT NULL CHECK(entity_type IN ('property','unit','contact','application','lease')),
 property_id uuid, unit_id uuid, contact_id uuid, application_id uuid, lease_id uuid,
 provider text NOT NULL CHECK(provider ~ '^[a-z][a-z0-9_-]{0,99}$'), external_id text NOT NULL CHECK(char_length(btrim(external_id)) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(property_id,unit_id,contact_id,application_id,lease_id)=1),
 CHECK((entity_type='property' AND property_id IS NOT NULL) OR (entity_type='unit' AND unit_id IS NOT NULL) OR (entity_type='contact' AND contact_id IS NOT NULL) OR (entity_type='application' AND application_id IS NOT NULL) OR (entity_type='lease' AND lease_id IS NOT NULL)),
 UNIQUE(organization_id,provider,entity_type,external_id),
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(unit_id,organization_id) REFERENCES units(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(contact_id,organization_id) REFERENCES contacts(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(application_id,organization_id) REFERENCES applications(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(lease_id,organization_id) REFERENCES leases(id,organization_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX external_mapping_property_key ON external_record_mappings(organization_id,provider,property_id) WHERE property_id IS NOT NULL;
CREATE UNIQUE INDEX external_mapping_unit_key ON external_record_mappings(organization_id,provider,unit_id) WHERE unit_id IS NOT NULL;
CREATE UNIQUE INDEX external_mapping_contact_key ON external_record_mappings(organization_id,provider,contact_id) WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX external_mapping_application_key ON external_record_mappings(organization_id,provider,application_id) WHERE application_id IS NOT NULL;
CREATE UNIQUE INDEX external_mapping_lease_key ON external_record_mappings(organization_id,provider,lease_id) WHERE lease_id IS NOT NULL;