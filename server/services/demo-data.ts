import type { AuthUser, DemoData } from '../../shared/contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { requireIsolatedDemo } from './demo-environment.js';

export async function loadDemoData(config: ServerConfig, database: Database, user: AuthUser): Promise<DemoData> {
  if (user.organization.role !== 'organization_admin') throw new ApiError(403,'DEMO_ACCESS_DENIED','Only the demo organization administrator can open the synthetic demo dataset.');
  await requireIsolatedDemo(config,database);
  const organization=await database.query('SELECT id FROM organizations WHERE id=$1 AND environment=$2',[user.organization.id,'demo']);
  if(!organization.rowCount) throw new ApiError(403,'DEMO_ACCESS_DENIED','This organization is not a demo organization.');
  // The retained Stage 03 fixture snapshot stays bounded; actual CRM directories use paginated APIs.
  const parameters=[user.organization.id];
  const properties=await database.query<DemoData['properties'][number]>(`SELECT id,name,address,city,property_type AS type FROM properties WHERE organization_id=$1 AND seed_key LIKE 'stage03.%' ORDER BY name,id`,parameters);
  const units=await database.query<DemoData['units'][number]>(`SELECT id,property_id AS "propertyId",label,bedrooms,status,monthly_rent::double precision AS "monthlyRent" FROM units WHERE organization_id=$1 AND seed_key LIKE 'stage03.%' ORDER BY property_id,label,id`,parameters);
  const leads=await database.query<DemoData['leads'][number]>(`SELECT l.id,c.display_name AS name,c.email,l.status,l.intent,l.property_id AS "propertyId",l.unit_id AS "unitId",l.notes FROM leads l JOIN contacts c ON c.id=l.contact_id AND c.organization_id=l.organization_id WHERE l.organization_id=$1 AND l.seed_key LIKE 'stage03.%' ORDER BY c.display_name,l.id`,parameters);
  const tasks=await database.query<DemoData['tasks'][number]>(`SELECT id,lead_id AS "leadId",property_id AS "propertyId",title,due_at AS "dueAt",status FROM tasks WHERE organization_id=$1 AND seed_key LIKE 'stage03.%' ORDER BY due_at,id`,parameters);
  const viewings=await database.query<DemoData['viewings'][number]>(`SELECT id,lead_id AS "leadId",property_id AS "propertyId",unit_id AS "unitId",starts_at AS "startsAt",status FROM viewings WHERE organization_id=$1 AND seed_key LIKE 'stage03.%' ORDER BY starts_at,id`,parameters);
  const activities=await database.query<DemoData['activities'][number]>(`SELECT id,lead_id AS "leadId",property_id AS "propertyId",kind,summary,occurred_at AS "occurredAt",simulated FROM lead_activities WHERE organization_id=$1 AND seed_key LIKE 'stage03.%' ORDER BY occurred_at DESC,id`,parameters);
  return {demo:true,integrationsMode:'simulation',outboundMode:'simulation',properties:properties.rows,units:units.rows,leads:leads.rows,tasks:tasks.rows,viewings:viewings.rows,activities:activities.rows};
}
