import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { requireIsolatedDemo } from './demo-environment.js';
import { hashPassword } from './passwords.js';

type Entity = 'properties' | 'units' | 'leads' | 'tasks' | 'viewings' | 'lead_activities';
type Values = Record<string, string | number | boolean | null>;
const dataset = 'stage03';
// New fixture leads carry the same next action as their saved synthetic task.
const fixtureLeadActions: Record<string, Values> = {
 'lead.maya': { next_action: "Prepare Maya's Harbor House viewing", next_action_at: '2026-10-22T09:00:00Z' },
 'lead.jordan': { next_action: 'Follow up with Jordan about move-in timing', next_action_at: '2026-10-22T13:00:00Z' },
 'lead.priya': { next_action: "Review Priya's sales enquiry with the property team", next_action_at: '2026-10-23T10:00:00Z' },
};

/** Explicit commands only: this service is never imported by server startup. */
export async function seedDemo(database: Database, config: ServerConfig, reset = false) {
  await database.requireReady();
  return database.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [6_856_202]);
    await requireIsolatedDemo(config, client);
    let organization = (await client.query<{id: string; environment: string}>('SELECT id,environment FROM organizations WHERE slug=$1 FOR UPDATE', ['ootla-demo'])).rows[0];
    let user = (await client.query<{id: string; is_demo: boolean; account_kind: string}>('SELECT id,is_demo,account_kind FROM users WHERE email=$1 FOR UPDATE', [config.demoAdminEmail])).rows[0];
    if (organization && organization.environment !== 'demo') throw new ApiError(409, 'SEED_CONFLICT', 'The demo organization identifier is already in use. No data was changed.');
    if (user) {
      const membership = organization ? await client.query('SELECT id FROM organization_memberships WHERE organization_id=$1 AND user_id=$2', [organization.id,user.id]) : null;
      if (!user.is_demo || user.account_kind !== 'staff' || !membership?.rowCount) throw new ApiError(409, 'SEED_CONFLICT', 'The demo email belongs to an existing non-demo record. No data was changed.');
    }
    let changedRecords = 0;
    if (!organization) {
      organization = (await client.query<{id: string; environment: string}>("INSERT INTO organizations(name,slug,environment) VALUES('Ootla Demo','ootla-demo','demo') RETURNING id,environment")).rows[0]!;
      changedRecords++;
    }
    if (!user) {
      const passwordHash = await hashPassword(config.demoAdminPassword);
      user = (await client.query<{id: string; is_demo: boolean; account_kind: string}>("INSERT INTO users(email,display_name,password_hash,is_demo) VALUES($1,'Demo Administrator',$2,true) RETURNING id,is_demo,account_kind",[config.demoAdminEmail,passwordHash])).rows[0]!;
      await client.query("INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'organization_admin')",[organization.id,user.id]);
      changedRecords++;
    } else if (reset) {
      // Reset is deliberate and limited to this established demo identity.
      await client.query('UPDATE users SET password_hash=$2,active=true,updated_at=now() WHERE id=$1 AND is_demo=true',[user.id,await hashPassword(config.demoAdminPassword)]);
      await client.query("UPDATE organization_memberships SET role='organization_admin',active=true,updated_at=now() WHERE organization_id=$1 AND user_id=$2",[organization.id,user.id]);
      await client.query('DELETE FROM sessions WHERE user_id=$1',[user.id]);
    }
    const organizationId = organization.id;
    const put = async (entity: Entity, key: string, values: Values) => {
      const seedKey = `${dataset}.${key}`;
      const ownership = (await client.query<{record_id: string}>('SELECT record_id FROM demo_seed_records WHERE organization_id=$1 AND entity_type=$2 AND seed_key=$3',[organizationId,entity,seedKey])).rows[0];
      const existing = (await client.query<{id: string}>(`SELECT id FROM ${entity} WHERE organization_id=$1 AND seed_key=$2`,[organizationId,seedKey])).rows[0];
      if (existing && (!ownership || ownership.record_id !== existing.id)) throw new ApiError(409,'SEED_CONFLICT','A demo seed key conflicts with a record outside the owned dataset. No data was changed.');
      const recordId = ownership?.record_id ?? randomUUID();
      const recordValues: Values = entity === 'properties' ? { source_system: 'demo', ...values } : entity === 'units' ? { source_system: 'demo', availability_source: 'demo', availability_verified_at: null, ...values } : entity === 'leads' ? { source: 'demo', ...fixtureLeadActions[key], ...values } : entity === 'tasks' ? { origin: 'demo', ...values } : values;
      const columns = ['id','organization_id','seed_key',...Object.keys(recordValues)];
      const parameters = [recordId,organizationId,seedKey,...Object.values(recordValues)];
      const conflict = reset ? `DO UPDATE SET ${Object.keys(recordValues).map((column)=>`${column}=EXCLUDED.${column}`).join(',')},updated_at=now()` : 'DO NOTHING';
      const record = (await client.query<{id: string}>(`INSERT INTO ${entity}(${columns.join(',')}) VALUES(${parameters.map((_,index)=>`$${index+1}`).join(',')}) ON CONFLICT(organization_id,seed_key) ${conflict} RETURNING id`,parameters)).rows[0];
      if (record) changedRecords++;
      const id = record?.id ?? existing!.id;
      await client.query('INSERT INTO demo_seed_records(organization_id,entity_type,seed_key,record_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[organizationId,entity,seedKey,id]);
      return id;
    };
    const harbor = await put('properties','property.harbor',{name:'Harbor House',address:'18 Harbor Lane',city:'Demo City',property_type:'apartments'});
    const oak = await put('properties','property.oak',{name:'Oak Gardens',address:'42 Oak Avenue',city:'Demo City',property_type:'townhomes'});
    const summit = await put('properties','property.summit',{name:'Summit Residences',address:'7 Summit Way',city:'Demo City',property_type:'condominiums'});
    const harbor101 = await put('units','unit.harbor101',{property_id:harbor,label:'101',bedrooms:1,status:'available',monthly_rent:1650});
    await put('units','unit.harbor204',{property_id:harbor,label:'204',bedrooms:2,status:'occupied',monthly_rent:2150});
    const oakA = await put('units','unit.oakA',{property_id:oak,label:'A',bedrooms:3,status:'available',monthly_rent:2850});
    await put('units','unit.oakB',{property_id:oak,label:'B',bedrooms:3,status:'reserved',monthly_rent:2900});
    const summit302 = await put('units','unit.summit302',{property_id:summit,label:'302',bedrooms:2,status:'available',monthly_rent:2400});
    await put('units','unit.summit405',{property_id:summit,label:'405',bedrooms:2,status:'occupied',monthly_rent:2500});
    const maya = await put('leads','lead.maya',{property_id:harbor,unit_id:harbor101,display_name:'Maya Chen',email:'maya.chen@example.test',status:'viewing_scheduled',intent:'leasing',notes:'Synthetic demo lead. Looking for a one-bedroom home near transit; prefers a weekday viewing.'});
    const jordan = await put('leads','lead.jordan',{property_id:oak,unit_id:oakA,display_name:'Jordan Ellis',email:'jordan.ellis@example.test',status:'contacted',intent:'leasing',notes:'Synthetic demo lead. Interested in a three-bedroom townhome and a flexible move-in date.'});
    const priya = await put('leads','lead.priya',{property_id:summit,unit_id:summit302,display_name:'Priya Shah',email:'priya.shah@example.test',status:'qualified',intent:'sales',notes:'Synthetic demo sales enquiry. Staff should discuss availability and next steps; no approval decision has been made.'});
    await put('tasks','task.maya',{property_id:harbor,lead_id:maya,title:'Prepare Maya\'s Harbor House viewing',due_at:'2026-10-22T09:00:00Z',status:'open'});
    await put('tasks','task.jordan',{property_id:oak,lead_id:jordan,title:'Follow up with Jordan about move-in timing',due_at:'2026-10-22T13:00:00Z',status:'open'});
    await put('tasks','task.priya',{property_id:summit,lead_id:priya,title:'Review Priya\'s sales enquiry with the property team',due_at:'2026-10-23T10:00:00Z',status:'open'});
    await put('viewings','viewing.maya',{property_id:harbor,lead_id:maya,unit_id:harbor101,starts_at:'2026-10-23T14:00:00Z',status:'scheduled'});
    await put('viewings','viewing.priya',{property_id:summit,lead_id:priya,unit_id:summit302,starts_at:'2026-10-24T10:00:00Z',status:'scheduled'});
    await put('lead_activities','activity.maya',{property_id:harbor,lead_id:maya,kind:'viewing_note',summary:'Simulated: Maya requested a Harbor House viewing. No calendar invitation was sent.',occurred_at:'2026-10-20T09:00:00Z',simulated:true});
    await put('lead_activities','activity.jordan',{property_id:oak,lead_id:jordan,kind:'follow_up_note',summary:'Simulated: a follow-up reminder was prepared for Jordan. No email or SMS was sent.',occurred_at:'2026-10-20T10:00:00Z',simulated:true});
    await put('lead_activities','activity.priya',{property_id:summit,lead_id:priya,kind:'staff_review_note',summary:'Simulated: Priya\'s sales enquiry is ready for staff review. No screening or payment request was made.',occurred_at:'2026-10-20T11:00:00Z',simulated:true});
    if (reset || changedRecords) await client.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)',[organizationId,user.id,reset?'demo.reset':'demo.seed',JSON.stringify({dataset,changedRecords,integrationsMode:'simulation',outboundMode:'simulation'})]);
    return {organizationId,userId:user.id,changedRecords,reset};
  });
}

/** Confirmation names the exact target; no default, truncation or database-wide reset exists. */
export async function resetDemo(database: Database, config: ServerConfig, confirmation: string | undefined) {
  if (!confirmation || confirmation !== config.databaseName) throw new ApiError(400,'RESET_CONFIRMATION_REQUIRED','Supply --confirm-reset=<exact demo database name>. No data was changed.');
  return seedDemo(database,config,true);
}
