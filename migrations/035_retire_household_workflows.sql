-- Retire active household workflows without changing or deleting historical rows.
-- Canonical contacts, participants, leads, properties, units, applications, leases
-- and person-specific resident grants remain the authorization/relationship model.
ALTER TABLE resident_demo_setup ALTER COLUMN household_id DROP NOT NULL;

-- Old membership/property composites must not impose a household dependency on
-- later application/lease edits. Preserve the historical organization-scoped
-- household reference itself for archival integrity; no new workflow writes it.
DO $$
DECLARE legacy_constraint record;
BEGIN
 FOR legacy_constraint IN
  SELECT conrelid::regclass AS relation_name, conname
  FROM pg_constraint
  WHERE contype='f' AND conrelid IN ('applications'::regclass,'leases'::regclass)
    AND confrelid IN ('household_members'::regclass,'household_property_links'::regclass)
 LOOP
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',legacy_constraint.relation_name,legacy_constraint.conname);
 END LOOP;
END $$;
ALTER TABLE applications ADD CONSTRAINT applications_legacy_household_fkey
 FOREIGN KEY(household_id,organization_id) REFERENCES households(id,organization_id) ON DELETE RESTRICT;
ALTER TABLE leases ADD CONSTRAINT leases_legacy_household_fkey
 FOREIGN KEY(household_id,organization_id) REFERENCES households(id,organization_id) ON DELETE RESTRICT;
COMMENT ON TABLE households IS 'Historical records retained for preservation. Household workflows are retired.';
