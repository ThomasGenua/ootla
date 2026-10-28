import type { AuthUser, DashboardPeriod, DashboardSummary } from '../../shared/contracts.js';
import type { Database } from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {isIsolatedDemo} from './demo-environment.js';

/** These metrics describe saved records, including synthetic records in isolated demos. */
export async function loadDashboard(database: Database, user: AuthUser, period: DashboardPeriod, config?:ServerConfig): Promise<DashboardSummary> {
  const isolatedDemo=config?await isIsolatedDemo(config,database):false;
  const result = await database.query<{ new_leads: number; tours_booked: number; applications: number;leases_signed:number }>(`
    WITH bounds AS (
      SELECT CASE $4::text
        WHEN 'month' THEN date_trunc('month', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'
        WHEN 'week' THEN date_trunc('week', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'
        ELSE NULL::timestamptz
      END AS since, NOW() AS until
    )
    SELECT
      (SELECT count(*)::integer FROM leads l CROSS JOIN bounds b
        WHERE l.organization_id=$1
          AND ($2::boolean OR EXISTS (
            SELECT 1 FROM property_access_assignments a
            WHERE a.organization_id=l.organization_id AND a.property_id=l.property_id AND a.membership_id=$3
          ))
          AND (b.since IS NULL OR (l.created_at >= b.since AND l.created_at <= b.until))
      ) AS new_leads,
      (SELECT count(*)::integer FROM viewings v CROSS JOIN bounds b
        WHERE v.organization_id=$1 AND v.status <> 'cancelled'
          AND ($2::boolean OR EXISTS (
            SELECT 1 FROM property_access_assignments a
            WHERE a.organization_id=v.organization_id AND a.property_id=v.property_id AND a.membership_id=$3
          ))
          AND (b.since IS NULL OR (v.created_at >= b.since AND v.created_at <= b.until))
      ) AS tours_booked,
      (SELECT count(*)::integer FROM applications application CROSS JOIN bounds b
        WHERE application.organization_id=$1
          AND ($2::boolean OR EXISTS (
            SELECT 1 FROM property_access_assignments pa
            WHERE pa.organization_id=application.organization_id AND pa.property_id=application.property_id AND pa.membership_id=$3
          ))
          AND ($2::boolean OR NOT EXISTS (
            SELECT 1 FROM lead_property_interests li
            WHERE li.organization_id=application.organization_id AND li.lead_id=application.lead_id
              AND NOT EXISTS (
                SELECT 1 FROM property_access_assignments pa
                WHERE pa.organization_id=li.organization_id AND pa.property_id=li.property_id AND pa.membership_id=$3
              )
          ))
          AND (b.since IS NULL OR (application.created_at >= b.since AND application.created_at <= b.until))
      ) AS applications,
      (SELECT count(DISTINCT lease.id)::integer FROM lease_workflows workflow
        JOIN leases lease ON lease.id=workflow.lease_id AND lease.organization_id=workflow.organization_id
        JOIN applications application ON application.id=workflow.application_id AND application.organization_id=workflow.organization_id
          AND lease.application_id=application.id AND lease.property_id=application.property_id
          AND lease.contact_id=application.contact_id AND lease.lead_id IS NOT DISTINCT FROM application.lead_id
        CROSS JOIN bounds b
        WHERE workflow.organization_id=$1 AND lease.status='active'
          AND workflow.stage IN ('fully_signed','move_in_scheduled','completed')
          AND workflow.signature_verified_at IS NOT NULL
          AND char_length(btrim(workflow.signature_evidence_reference))>=5
          AND (workflow.signature_evidence_kind='manual_attestation' AND lease.source_system='local'
            OR workflow.signature_evidence_kind='demo_event' AND $5::boolean)
          AND workflow.signature_verified_at<=b.until
          AND (b.since IS NULL OR workflow.signature_verified_at>=b.since)
          AND ($2::boolean OR EXISTS (
            SELECT 1 FROM property_access_assignments pa
            WHERE pa.organization_id=lease.organization_id AND pa.property_id=lease.property_id AND pa.membership_id=$3
          ))
          AND ($2::boolean OR NOT EXISTS (
            SELECT 1 FROM lead_property_interests li
            WHERE li.organization_id=lease.organization_id AND li.lead_id=lease.lead_id
              AND NOT EXISTS (
                SELECT 1 FROM property_access_assignments pa
                WHERE pa.organization_id=li.organization_id AND pa.property_id=li.property_id AND pa.membership_id=$3
              )
          ))
      ) AS leases_signed
  `, [user.organization.id, user.organization.role === 'organization_admin', user.membershipId, period,isolatedDemo]);
  const row = result.rows[0]!;
  return {
    period,
    timeZone: 'Africa/Lagos',
    metrics: {
      newLeads: row.new_leads,
      toursBooked: row.tours_booked,
      // Applications count canonical records created in the selected period, including drafts.
      applications: row.applications,
      // Count canonical signature attestations, not stored leases or a lead-card stage.
      // Demo evidence is included only after verifying this runtime and its isolated database.
      leasesSigned: row.leases_signed,
    },
  };
}
