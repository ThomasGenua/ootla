CREATE TABLE property_operation_receipts (
 organization_id uuid NOT NULL REFERENCES organizations(id), request_key uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), operation text NOT NULL, payload_hash text NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,request_key)
);
CREATE TABLE maintenance_vendors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL,
 name text NOT NULL, trade text NOT NULL, email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
 UNIQUE(id,organization_id,property_id), FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id)
);
CREATE TABLE maintenance_work_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL,
 lead_id uuid, request_id uuid NOT NULL UNIQUE REFERENCES resident_requests(id), vendor_id uuid,
 owner_membership_id uuid REFERENCES organization_memberships(id),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','scheduled','in_progress','completed','cancelled')),
 appointment_start timestamptz, appointment_end timestamptz, entry_instructions text NOT NULL DEFAULT '',
 estimate numeric(12,2) CHECK(estimate>=0), actual_cost numeric(12,2) CHECK(actual_cost>=0), currency char(3) NOT NULL DEFAULT 'CAD',
 completion_note text NOT NULL DEFAULT '', resident_confirmed_at timestamptz,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id),
 FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id),
 FOREIGN KEY(vendor_id,organization_id,property_id) REFERENCES maintenance_vendors(id,organization_id,property_id),
 CHECK((appointment_start IS NULL)=(appointment_end IS NULL)), CHECK(appointment_end>appointment_start)
);
CREATE TABLE maintenance_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), work_order_id uuid NOT NULL REFERENCES maintenance_work_orders(id),
 uploaded_by uuid NOT NULL REFERENCES users(id), name text NOT NULL, media_type text NOT NULL CHECK(media_type IN ('image/png','image/jpeg')),
 content bytea NOT NULL CHECK(octet_length(content)<=2097152), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tenancy_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL,
 lead_id uuid, resident_id uuid NOT NULL UNIQUE REFERENCES resident_relationships(id),
 lease_start date NOT NULL, lease_end date NOT NULL CHECK(lease_end>lease_start), monthly_rent numeric(12,2) NOT NULL CHECK(monthly_rent>=0), currency char(3) NOT NULL,
 followup_days integer[] NOT NULL DEFAULT '{90,60,30}', next_action_on date NOT NULL,
 owner_membership_id uuid REFERENCES organization_memberships(id), move_out_on date, move_out_note text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','notice_received','moved_out')),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id), FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id)
);
CREATE TABLE renewal_offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES tenancy_plans(id),
 starts_on date NOT NULL, ends_on date NOT NULL CHECK(ends_on>starts_on), monthly_rent numeric(12,2) NOT NULL CHECK(monthly_rent>=0),
 respond_by date NOT NULL, terms text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','offered','accepted','declined','withdrawn','recorded')),
 response_note text NOT NULL DEFAULT '', evidence_reference text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_renewal_offer ON renewal_offers(plan_id) WHERE status IN ('draft','offered','accepted');
CREATE TABLE unit_turnovers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL, unit_id uuid NOT NULL UNIQUE,
 owner_membership_id uuid REFERENCES organization_memberships(id), expected_ready_on date NOT NULL,
 inspection_done boolean NOT NULL DEFAULT false, repairs_done boolean NOT NULL DEFAULT false, cleaning_done boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'inspection' CHECK(status IN ('inspection','repairs','cleaning','ready')),
 notes text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(unit_id,organization_id,property_id) REFERENCES units(id,organization_id,property_id)
);
CREATE TABLE unit_waitlist (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL, unit_id uuid NOT NULL,
 lead_id uuid NOT NULL, status text NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','drafted','closed')),
 note text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1, draft_id uuid REFERENCES conversation_messages(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,unit_id,lead_id),
 FOREIGN KEY(unit_id,organization_id,property_id) REFERENCES units(id,organization_id,property_id), FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id)
);
CREATE TABLE contact_duplicate_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 first_contact_id uuid NOT NULL, second_contact_id uuid NOT NULL, canonical_contact_id uuid,
 resolution text NOT NULL CHECK(resolution IN ('linked','distinct')), reason text NOT NULL, reviewed_by uuid NOT NULL REFERENCES users(id),
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,first_contact_id,second_contact_id), CHECK(first_contact_id<second_contact_id),
 CHECK((resolution='linked' AND canonical_contact_id IN (first_contact_id,second_contact_id)) OR (resolution='distinct' AND canonical_contact_id IS NULL)),
 FOREIGN KEY(first_contact_id,organization_id) REFERENCES contacts(id,organization_id), FOREIGN KEY(second_contact_id,organization_id) REFERENCES contacts(id,organization_id)
);
CREATE TABLE property_operation_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid REFERENCES properties(id), lead_id uuid REFERENCES leads(id), entity_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), kind text NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_operation_history_entity ON property_operation_history(entity_id,created_at DESC,id);
CREATE TABLE property_response_policies (
 property_id uuid PRIMARY KEY, organization_id uuid NOT NULL, enabled boolean NOT NULL,
 time_zone text NOT NULL, windows jsonb NOT NULL, response_minutes integer NOT NULL CHECK(response_minutes BETWEEN 1 AND 10080),
 escalation_minutes integer NOT NULL CHECK(escalation_minutes BETWEEN 1 AND 10080),
 manager_membership_id uuid REFERENCES organization_memberships(id), version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id)
);
-- Working minutes use the property's timezone, including daylight-saving offsets.
CREATE FUNCTION ootla_response_deadline(start_at timestamptz, zone text, minutes integer, windows jsonb)
RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
DECLARE day date := (start_at AT TIME ZONE zone)::date; w jsonb; lo timestamptz; hi timestamptz; remaining interval := make_interval(mins=>minutes);
BEGIN
 FOR n IN 0..1500 LOOP
  FOR w IN SELECT value FROM jsonb_array_elements(windows) WHERE (value->>'weekday')::integer=extract(dow FROM day)::integer ORDER BY (value->>'start')::integer LOOP
   lo:=GREATEST((day::timestamp+make_interval(mins=>(w->>'start')::integer)) AT TIME ZONE zone,start_at);
   hi:=(day::timestamp+make_interval(mins=>(w->>'end')::integer)) AT TIME ZONE zone;
   IF hi>lo THEN IF hi-lo>=remaining THEN RETURN lo+remaining; END IF; remaining:=remaining-(hi-lo); END IF;
  END LOOP;
  day:=day+1;
 END LOOP;
 RAISE EXCEPTION 'Business calendar cannot satisfy response target';
END;
$$;
ALTER TABLE resident_relationships DROP CONSTRAINT resident_relationships_status_check;
ALTER TABLE resident_relationships ADD CONSTRAINT resident_relationships_status_check CHECK(status IN ('pending_move_in','active','ended'));
CREATE INDEX work_orders_queue ON maintenance_work_orders(organization_id,status,appointment_start);
CREATE INDEX tenancy_followup_queue ON tenancy_plans(organization_id,status,next_action_on);
CREATE INDEX waitlist_unit_queue ON unit_waitlist(organization_id,unit_id,status);

-- Bind generated drafts to their reviewed workflow state, including edited drafts.
CREATE TABLE property_message_context (
 message_id uuid PRIMARY KEY REFERENCES conversation_messages(id),
 renewal_offer_id uuid REFERENCES renewal_offers(id), waitlist_id uuid REFERENCES unit_waitlist(id),
 source_version integer NOT NULL CHECK(source_version>0),
 CHECK((renewal_offer_id IS NOT NULL)::integer+(waitlist_id IS NOT NULL)::integer=1)
);
