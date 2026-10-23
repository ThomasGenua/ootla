import { createHash } from 'node:crypto';
import { loadConfig, ConfigurationError } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { requireIsolatedDemo } from '../server/services/demo-environment.js';
import { ApiError } from '../server/http/errors.js';

// Deliberate optional fixtures only. Never imported by server startup or ordinary seeding.
function fixtureId(key: string): string {
  const hex=createHash('sha256').update(`ootla-stage06-volume:${key}`).digest('hex').slice(0,32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`;
}
async function main() {
  const config=loadConfig();
  const args=process.argv.slice(2);
  if(args.some(arg=>!/^--(?:properties=\d+|units-per-property=\d+|confirm=[a-z0-9_]+|dry-run)$/.test(arg))) throw new ConfigurationError('Usage: npm run demo:volume -- --properties=3000 --units-per-property=2 --confirm=<exact-demo-database> [--dry-run]');
  const value=(key:string,fallback:string)=>args.find(arg=>arg.startsWith(`--${key}=`))?.slice(key.length+3)??fallback;
  const count=Number(value('properties','3000'));
  const unitsPerProperty=Number(value('units-per-property','2'));
  if(!Number.isInteger(count)||count<1||count>10000||!Number.isInteger(unitsPerProperty)||unitsPerProperty<0||unitsPerProperty>10) throw new ConfigurationError('Choose 1 to 10000 properties and 0 to 10 separate units per property.');
  if(config.production||!config.demoMode||!/^ootla_demo(?:_[a-z0-9_]+)?$/.test(config.databaseName??'')) throw new ConfigurationError('Volume fixtures require an isolated nonproduction Ootla demo database. No data was changed.');
  const url=new URL(config.databaseUrl);
  if(url.hostname!=='127.0.0.1'||url.port!=='55439'||url.username!=='ootla'||url.search||url.hash) throw new ConfigurationError('Volume fixtures are limited to the project-owned local demo database. No data was changed.');
  if(value('confirm','')!==config.databaseName) throw new ConfigurationError('Confirm the exact demo database with --confirm=<database-name>. No data was changed.');
  const database=new Database(config);
  try {
    await database.requireReady();
    await requireIsolatedDemo(config,database);
    const identity=await database.query<{name:string}>('SELECT current_database() AS name');
    if(identity.rows[0]?.name!==config.databaseName) throw new ConfigurationError('The connected database did not match the confirmed name. No data was changed.');
    if(!(await database.query("SELECT to_regclass('public.property_groups') IS NOT NULL AS ready")).rows[0]?.ready) throw new ConfigurationError('Apply Stage 06 migration 004 first. No data was changed.');
    const organization=(await database.query<{id:string}>("SELECT id FROM organizations WHERE slug='ootla-demo' AND environment='demo'")).rows[0];
    if(!organization) throw new ConfigurationError('Prepare the isolated demo account with the deliberate db:seed command before adding optional fixtures.');
    if(args.includes('--dry-run')) { console.log(`Dry run: up to ${count} synthetic properties and ${count*unitsPerProperty} separate units; no data changed.`);return; }
    const result=await database.transaction(async client=>{
      await requireIsolatedDemo(config,client);
      await client.query('SELECT pg_advisory_xact_lock($1)',[6856206]);
      const organizationId=organization.id;
      const groupIds=[fixtureId(`${organizationId}:group:north`),fixtureId(`${organizationId}:group:south`)];
      for(const [index,id] of groupIds.entries()) {
        await client.query('INSERT INTO property_groups(id,organization_id,name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,organizationId,`Volume fixtures - ${index===0?'North':'South'}`]);
        if(!(await client.query('SELECT id FROM property_groups WHERE id=$1 AND organization_id=$2',[id,organizationId])).rowCount) throw new ApiError(409,'FIXTURE_CONFLICT','A fixture group conflicts with an existing record. No fixture data was changed.');
      }
      let propertiesAdded=0;let unitsAdded=0;
      for(let start=1;start<=count;start+=100) {
        const end=Math.min(count,start+99);
        const propertyParams:unknown[]=[];const propertyValues:string[]=[];
        const expectedProperties=new Map<string,string>();
        const unitRows:{id:string;propertyId:string;key:string;label:string;status:string}[]=[];
        for(let index=start;index<=end;index++) {
          const key=`stage06.volume.property.${String(index).padStart(5,'0')}`;
          const id=fixtureId(`${organizationId}:${key}`);expectedProperties.set(id,key);
          const offset=propertyParams.length;
          propertyParams.push(id,organizationId,key,`Fixture property ${String(index).padStart(5,'0')}`,`${index} Example Lane`,index%2?'Fixture North':'Fixture South','apartments',groupIds[(index-1)%2]);
          propertyValues.push(`(${Array.from({length:8},(_,i)=>`$${offset+i+1}`).join(',')},'demo')`);
          for(let unit=1;unit<=unitsPerProperty;unit++) {const unitKey=`stage06.volume.unit.${String(index).padStart(5,'0')}.${unit}`;unitRows.push({id:fixtureId(`${organizationId}:${unitKey}`),propertyId:id,key:unitKey,label:`Fixture-${unit}`,status:unit%2?'available':'occupied'});}
        }
        propertiesAdded+=(await client.query(`INSERT INTO properties(id,organization_id,seed_key,name,address,city,property_type,group_id,source_system) VALUES ${propertyValues.join(',')} ON CONFLICT DO NOTHING RETURNING id`,propertyParams)).rowCount??0;
        const existing=await client.query<{id:string;seed_key:string}>('SELECT id,seed_key FROM properties WHERE organization_id=$1 AND id=ANY($2::uuid[])',[organizationId,[...expectedProperties.keys()]]);
        if(existing.rows.length!==expectedProperties.size||existing.rows.some(row=>expectedProperties.get(row.id)!==row.seed_key)) throw new ApiError(409,'FIXTURE_CONFLICT','A property fixture identifier conflicts with existing data. No fixture data was changed.');
        if(unitRows.length) {
          const unitParams:unknown[]=[];const unitValues:string[]=[];
          for(const row of unitRows) {const offset=unitParams.length;unitParams.push(row.id,organizationId,row.propertyId,row.key,row.label,1,row.status,1200);unitValues.push(`(${Array.from({length:8},(_,i)=>`$${offset+i+1}`).join(',')},'demo','demo',NULL)`);}
          unitsAdded+=(await client.query(`INSERT INTO units(id,organization_id,property_id,seed_key,label,bedrooms,status,monthly_rent,source_system,availability_source,availability_verified_at) VALUES ${unitValues.join(',')} ON CONFLICT DO NOTHING RETURNING id`,unitParams)).rowCount??0;
          const expectedUnits=new Map(unitRows.map(row=>[row.id,row]));
          const existingUnits=await client.query<{id:string;seed_key:string;property_id:string}>('SELECT id,seed_key,property_id FROM units WHERE organization_id=$1 AND id=ANY($2::uuid[])',[organizationId,[...expectedUnits.keys()]]);
          if(existingUnits.rows.length!==expectedUnits.size||existingUnits.rows.some(row=>{const expected=expectedUnits.get(row.id)!;return row.seed_key!==expected.key||row.property_id!==expected.propertyId;})) throw new ApiError(409,'FIXTURE_CONFLICT','A unit fixture identifier conflicts with existing data. No fixture data was changed.');
        }
      }
      return {propertiesAdded,unitsAdded};
    });
    console.log(`Optional synthetic fixtures: ${result.propertiesAdded} properties and ${result.unitsAdded} separate units added. Existing records/edits preserved; availability is demo-only and unverified. No leads, messages, provider connections or payments created.`);
  }finally{await database.close();}
}
main().catch((error:unknown)=>{console.error(error instanceof ConfigurationError||error instanceof ApiError?error.message:'Volume fixtures failed. Check the local isolated database and Stage 06 migration. No credentials or raw database errors are printed.');process.exitCode=1;});