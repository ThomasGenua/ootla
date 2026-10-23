-- Stage 13: persistent viewing scheduling. Old viewing values remain unchanged.
ALTER TABLE viewings DROP CONSTRAINT viewings_status_check;
ALTER TABLE viewings ADD CONSTRAINT viewings_status_check CHECK(status IN ('scheduled','completed','cancelled','no_show'));
ALTER TABLE viewings DROP CONSTRAINT viewings_lead_id_organization_id_property_id_fkey;
ALTER TABLE viewings ADD CONSTRAINT viewings_lead_interest_fkey FOREIGN KEY(lead_id,organization_id,property_id)
 REFERENCES lead_property_interests(lead_id,organization_id,property_id) ON DELETE RESTRICT;
ALTER TABLE viewings
 ADD COLUMN ends_at timestamptz,
 ADD COLUMN time_zone text,
 ADD COLUMN owner_membership_id uuid,
 ADD COLUMN duration_minutes integer CHECK(duration_minutes BETWEEN 15 AND 180),
 ADD COLUMN buffer_before_minutes integer CHECK(buffer_before_minutes BETWEEN 0 AND 60),
 ADD COLUMN buffer_after_minutes integer CHECK(buffer_after_minutes BETWEEN 0 AND 60),
 ADD COLUMN location text CHECK(location IS NULL OR char_length(location)<=500),
 ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
 ADD COLUMN managed_by_ootla boolean NOT NULL DEFAULT false,
 ADD COLUMN booking_origin text CHECK(booking_origin IN ('staff','public')),
 ADD COLUMN created_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 ADD COLUMN created_by_membership_id uuid,
 ADD CONSTRAINT viewings_owner_tenant_fkey FOREIGN KEY(owner_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT,
 ADD CONSTRAINT viewings_creator_identity_fkey FOREIGN KEY(created_by_membership_id,created_by_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id) ON DELETE RESTRICT,
 ADD CONSTRAINT viewings_managed_metadata_check CHECK(NOT managed_by_ootla OR (ends_at IS NOT NULL AND ends_at>starts_at AND ends_at=starts_at+duration_minutes*interval '1 minute' AND time_zone IS NOT NULL AND owner_membership_id IS NOT NULL AND duration_minutes IS NOT NULL AND buffer_before_minutes IS NOT NULL AND buffer_after_minutes IS NOT NULL AND location IS NOT NULL AND booking_origin IS NOT NULL AND created_by_user_id IS NOT NULL AND created_by_membership_id IS NOT NULL));
ALTER TABLE viewings ADD CONSTRAINT viewings_id_organization_key UNIQUE(id,organization_id);
ALTER TABLE viewings ADD CONSTRAINT viewings_id_org_property_lead_key UNIQUE(id,organization_id,property_id,lead_id);
CREATE INDEX viewings_calendar_range_idx ON viewings(organization_id,starts_at,id);
CREATE INDEX viewings_owner_range_idx ON viewings(owner_membership_id,starts_at) WHERE status='scheduled';
CREATE TABLE property_viewing_settings(
 organization_id uuid NOT NULL,property_id uuid PRIMARY KEY,
 enabled boolean NOT NULL,time_zone text NOT NULL,duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 15 AND 180),
 buffer_before_minutes integer NOT NULL CHECK(buffer_before_minutes BETWEEN 0 AND 60),buffer_after_minutes integer NOT NULL CHECK(buffer_after_minutes BETWEEN 0 AND 60),
 location text NOT NULL CHECK(char_length(location) BETWEEN 1 AND 500),public_booking_enabled boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE viewing_staff_availability(
 organization_id uuid NOT NULL,property_id uuid NOT NULL,membership_id uuid NOT NULL,
 enabled boolean NOT NULL,windows jsonb NOT NULL CHECK(jsonb_typeof(windows)='array'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(property_id,membership_id),
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE viewing_lead_summaries(
 organization_id uuid NOT NULL,lead_id uuid PRIMARY KEY,previous_stage text NOT NULL,scheduled_stage text NOT NULL,
 expected_lead_version integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE viewing_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,lead_id uuid NOT NULL,unit_id uuid,owner_membership_id uuid NOT NULL,
 token_digest char(64) NOT NULL UNIQUE,settings_version integer NOT NULL,duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 15 AND 180),
 expires_at timestamptz NOT NULL,revoked_at timestamptz,booked_viewing_id uuid,booked_at timestamptz,
 created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_by_membership_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,organization_id),
 FOREIGN KEY(lead_id,organization_id,property_id) REFERENCES lead_property_interests(lead_id,organization_id,property_id) ON DELETE RESTRICT,
 FOREIGN KEY(unit_id,organization_id,property_id) REFERENCES units(id,organization_id,property_id) ON DELETE RESTRICT,
 FOREIGN KEY(owner_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(booked_viewing_id,organization_id,property_id,lead_id) REFERENCES viewings(id,organization_id,property_id,lead_id) ON DELETE RESTRICT,
 FOREIGN KEY(created_by_membership_id,created_by_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id) ON DELETE RESTRICT,
 CHECK((booked_viewing_id IS NULL)=(booked_at IS NULL))
);
CREATE INDEX viewing_invitations_lead_idx ON viewing_invitations(organization_id,lead_id,created_at DESC,id);
CREATE TABLE viewing_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,viewing_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('booked','rescheduled','cancelled','completed','no_show')),
 origin text NOT NULL CHECK(origin IN ('staff','public')),actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,actor_membership_id uuid,invitation_id uuid,
 metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object'),occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id),
 FOREIGN KEY(viewing_id,organization_id) REFERENCES viewings(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(actor_membership_id,actor_user_id,organization_id) REFERENCES organization_memberships(id,user_id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(invitation_id,organization_id) REFERENCES viewing_invitations(id,organization_id) ON DELETE RESTRICT,
 CHECK((origin='staff' AND actor_user_id IS NOT NULL AND actor_membership_id IS NOT NULL AND invitation_id IS NULL) OR (origin='public' AND actor_user_id IS NULL AND actor_membership_id IS NULL AND invitation_id IS NOT NULL))
);
CREATE INDEX viewing_events_history_idx ON viewing_events(organization_id,viewing_id,occurred_at DESC,id);
CREATE TABLE viewing_notification_receipts(
 event_id uuid PRIMARY KEY,organization_id uuid NOT NULL,mode text NOT NULL DEFAULT 'simulation' CHECK(mode='simulation'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(event_id,organization_id) REFERENCES viewing_events(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE viewing_action_receipts(
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,actor_scope text NOT NULL,request_key uuid NOT NULL,
 operation text NOT NULL,payload_hash char(64) NOT NULL,result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,actor_scope,request_key)
);
