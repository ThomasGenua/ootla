import type { AuthUser, DashboardPeriod, DashboardSummary } from '../../shared/contracts.js';
import type { Database } from '../db/pool.js';

/** These metrics describe saved records, including synthetic records in isolated demos. */
export async function loadDashboard(database: Database, user: AuthUser, period: DashboardPeriod): Promise<DashboardSummary> {
  const result = await database.query<{ new_leads: number; tours_booked: number; applications: number }>(`
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
      ) AS applications
  `, [user.organization.id, user.organization.role === 'organization_admin', user.membershipId, period]);
  const row = result.rows[0]!;
  return {
    period,
    timeZone: 'Africa/Lagos',
    metrics: {
      newLeads: row.new_leads,
      toursBooked: row.tours_booked,
      // Applications count canonical records created in the selected period, including drafts.
      applications: row.applications,
      // A stored lease is not sufficient evidence of a verified signing milestone.
      leasesSigned: null,
    },
  };
}
