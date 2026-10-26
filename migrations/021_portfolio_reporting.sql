-- Stage23: additive reporting metadata; operational records and provider-owned fields remain intact.
ALTER TABLE ask_threads ADD COLUMN reporting_context jsonb CHECK(reporting_context IS NULL OR jsonb_typeof(reporting_context)='object');
ALTER TABLE ask_threads ADD COLUMN authorization_scope char(64);
ALTER TABLE ask_threads ADD COLUMN authorization_scope_at timestamptz;
CREATE TABLE property_reporting_regions(
 organization_id uuid NOT NULL,property_id uuid NOT NULL,region text NOT NULL CHECK(char_length(btrim(region)) BETWEEN 1 AND 100 AND region !~ '[[:cntrl:]]'),
 updated_by_user_id uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,property_id),FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id)
);
CREATE INDEX property_reporting_regions_lookup_idx ON property_reporting_regions(organization_id,region,property_id);
CREATE TABLE reporting_action_receipts(
 organization_id uuid NOT NULL REFERENCES organizations(id),actor_user_id uuid NOT NULL REFERENCES users(id),request_key uuid NOT NULL,
 request_hash char(64) NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,actor_user_id,request_key)
);
CREATE INDEX reporting_leads_period_idx ON leads(organization_id,property_id,created_at,id);
CREATE INDEX reporting_viewings_booking_idx ON viewings(organization_id,property_id,created_at,id);
CREATE INDEX reporting_viewings_completed_idx ON viewings(organization_id,property_id,starts_at,id) WHERE status='completed';
CREATE INDEX reporting_applications_submitted_idx ON applications(organization_id,property_id,portal_submitted_at,id) WHERE portal_submitted_at IS NOT NULL;
CREATE INDEX reporting_milestones_period_idx ON lease_verified_milestones(organization_id,property_id,verified_at,lease_id);
