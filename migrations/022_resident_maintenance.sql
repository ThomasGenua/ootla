-- Stage24: resident access is explicit per person and canonical lease relationship, never household-wide.
ALTER TABLE resident_relationships ADD CONSTRAINT resident_relationships_id_organization_key UNIQUE(id,organization_id);
CREATE TABLE resident_access_grants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,relationship_id uuid NOT NULL,user_id uuid NOT NULL,
 account_kind text NOT NULL CHECK(account_kind IN('applicant','resident')),active boolean NOT NULL DEFAULT true,
 granted_by_user_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),revoked_at timestamptz,
 UNIQUE(id,organization_id),UNIQUE(organization_id,relationship_id,user_id),
 FOREIGN KEY(relationship_id,organization_id) REFERENCES resident_relationships(id,organization_id),
 FOREIGN KEY(user_id,account_kind) REFERENCES users(id,account_kind)
);
CREATE TABLE resident_sessions(
 token_digest char(64) PRIMARY KEY,user_id uuid NOT NULL,organization_id uuid NOT NULL REFERENCES organizations(id),
 account_kind text NOT NULL CHECK(account_kind IN('applicant','resident')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,revoked_at timestamptz,
 FOREIGN KEY(user_id,account_kind) REFERENCES users(id,account_kind),CHECK(expires_at>created_at AND expires_at<=created_at+interval '8 hours')
);
CREATE INDEX resident_sessions_expiry_idx ON resident_sessions(expires_at);
CREATE TABLE resident_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,relationship_id uuid NOT NULL,email text NOT NULL,
 token_digest char(64) NOT NULL UNIQUE,created_by_user_id uuid NOT NULL REFERENCES users(id),created_by_membership_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,used_at timestamptz,revoked_at timestamptz,
 request_key uuid NOT NULL,UNIQUE(organization_id,request_key),
 FOREIGN KEY(relationship_id,organization_id) REFERENCES resident_relationships(id,organization_id),
 FOREIGN KEY(created_by_membership_id,created_by_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id)
);
CREATE TABLE property_maintenance_settings(
 organization_id uuid NOT NULL,property_id uuid NOT NULL,enabled boolean NOT NULL DEFAULT false,
 emergency_instructions text NOT NULL CHECK(char_length(emergency_instructions) BETWEEN 10 AND 2000),
 emergency_staff_membership_id uuid,default_due_hours integer NOT NULL DEFAULT 72 CHECK(default_due_hours BETWEEN 1 AND 720),
 configured_by_user_id uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,property_id),FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),
 FOREIGN KEY(emergency_staff_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id)
);
CREATE TABLE maintenance_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,unit_id uuid,contact_id uuid NOT NULL,
 resident_relationship_id uuid NOT NULL,resident_user_id uuid NOT NULL REFERENCES users(id),
 category text NOT NULL CHECK(category IN('plumbing','electrical','appliance','heating_cooling','building','other')),
 location text NOT NULL CHECK(char_length(location) BETWEEN 2 AND 160),description text NOT NULL CHECK(char_length(description) BETWEEN 8 AND 4000),
 urgency text NOT NULL CHECK(urgency IN('routine','urgent','possible_emergency')),
 contact_preferences text NOT NULL,access_preferences text NOT NULL,
 status text NOT NULL DEFAULT 'awaiting_assignment' CHECK(status IN('submitted','awaiting_assignment','assigned','appointment_scheduled','in_progress','resolved','closed')),
 owner_membership_id uuid,due_at timestamptz,appointment_at timestamptz,appointment_confirmation text,
 source_state text NOT NULL CHECK(source_state IN('local','awaiting_configuration')),source_notice text NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,organization_id),FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),
 FOREIGN KEY(unit_id,organization_id,property_id) REFERENCES units(id,organization_id,property_id),
 FOREIGN KEY(contact_id,organization_id,property_id) REFERENCES contact_property_links(contact_id,organization_id,property_id),
 FOREIGN KEY(resident_relationship_id,organization_id) REFERENCES resident_relationships(id,organization_id),
 FOREIGN KEY(owner_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id),
 CHECK(status NOT IN('assigned','appointment_scheduled','in_progress') OR owner_membership_id IS NOT NULL),
 CHECK(status<>'appointment_scheduled' OR appointment_at IS NOT NULL AND appointment_confirmation IS NOT NULL)
);
CREATE INDEX maintenance_queue_idx ON maintenance_requests(organization_id,property_id,status,due_at,id);
CREATE INDEX maintenance_resident_idx ON maintenance_requests(organization_id,resident_user_id,created_at DESC,id);
CREATE TABLE maintenance_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,request_id uuid NOT NULL,
 actor_user_id uuid REFERENCES users(id),actor_kind text NOT NULL CHECK(actor_kind IN('resident','staff','system')),
 visibility text NOT NULL CHECK(visibility IN('resident','internal')),body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(request_id,organization_id) REFERENCES maintenance_requests(id,organization_id)
);
CREATE INDEX maintenance_messages_history_idx ON maintenance_messages(organization_id,request_id,created_at,id);
CREATE TABLE maintenance_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,request_id uuid NOT NULL,kind text NOT NULL,summary text NOT NULL,
 visibility text NOT NULL DEFAULT 'resident' CHECK(visibility IN('resident','internal')),actor_user_id uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(request_id,organization_id) REFERENCES maintenance_requests(id,organization_id)
);
CREATE TABLE maintenance_files(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,request_id uuid NOT NULL,name text NOT NULL,
 media_type text NOT NULL CHECK(media_type IN('application/pdf','image/png','image/jpeg','text/plain')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 2097152),sha256 char(64) NOT NULL,content bytea NOT NULL,
 uploaded_by_user_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(request_id,organization_id) REFERENCES maintenance_requests(id,organization_id),CHECK(octet_length(content)=size_bytes)
);
CREATE TABLE resident_renewal_offers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,relationship_id uuid NOT NULL,terms text NOT NULL,
 source text NOT NULL CHECK(source IN('staff_approved','provider_verified')),evidence text NOT NULL,approved_by_user_id uuid NOT NULL REFERENCES users(id),
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),valid_until timestamptz,active boolean NOT NULL DEFAULT true,
 FOREIGN KEY(relationship_id,organization_id) REFERENCES resident_relationships(id,organization_id)
);
CREATE INDEX resident_renewals_current_idx ON resident_renewal_offers(organization_id,relationship_id,approved_at DESC,id) WHERE active;
CREATE TABLE maintenance_action_receipts(
 organization_id uuid NOT NULL REFERENCES organizations(id),actor_user_id uuid NOT NULL REFERENCES users(id),request_key uuid NOT NULL,
 operation text NOT NULL,payload_hash char(64) NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,actor_user_id,request_key)
);
ALTER TABLE tasks ADD COLUMN maintenance_request_id uuid;
ALTER TABLE tasks ADD CONSTRAINT tasks_maintenance_request_fkey FOREIGN KEY(maintenance_request_id,organization_id) REFERENCES maintenance_requests(id,organization_id);
CREATE INDEX tasks_maintenance_link_idx ON tasks(organization_id,maintenance_request_id,status,id) WHERE maintenance_request_id IS NOT NULL;
ALTER TABLE ask_threads ADD COLUMN maintenance_request_id uuid;
ALTER TABLE ask_threads ADD CONSTRAINT ask_maintenance_request_fkey FOREIGN KEY(maintenance_request_id,organization_id) REFERENCES maintenance_requests(id,organization_id);

CREATE TABLE resident_demo_setup(
 organization_id uuid PRIMARY KEY REFERENCES organizations(id),property_id uuid NOT NULL,unit_id uuid NOT NULL,contact_id uuid NOT NULL,
 household_id uuid NOT NULL,application_id uuid NOT NULL,lease_id uuid NOT NULL,relationship_id uuid NOT NULL,resident_user_id uuid NOT NULL REFERENCES users(id),
 staff_user_id uuid NOT NULL REFERENCES users(id),staff_membership_id uuid NOT NULL,
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),
 FOREIGN KEY(unit_id,organization_id,property_id) REFERENCES units(id,organization_id,property_id),
 FOREIGN KEY(relationship_id,organization_id) REFERENCES resident_relationships(id,organization_id),
 FOREIGN KEY(staff_membership_id,staff_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id)
);
