import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {createServer} from 'vite';
import {withRenewalsPilotFixture} from './lib/renewals-pilot-fixture.js';
try {
 await withRenewalsPilotFixture(async f => {
  const fixtures=[];
  for(let i=0;i<13;i++) fixtures.push((await f.json('/api/property-foundation/properties','staff','POST',{name:'Refinement property '+String(i).padStart(2,'0'),address:i+' Preview Lane',city:i%2?'Toronto':'Ottawa',type:'residential',groupId:null},201)).property);
  const owned=(await f.json('/api/property-foundation/properties','staff','POST',{name:'Protected source property',address:'1 Source Lane',city:'Toronto',type:'residential',groupId:null},201)).property;
  const ownedUnit=(await f.json('/api/property-foundation/properties/'+owned.id+'/units','staff','POST',{label:'Source 101',bedrooms:2,status:'available',monthlyRent:2200,availabilitySource:'staff_reported',lastVerifiedAt:null},201)).unit;
  await f.database.query("UPDATE properties SET source_system='yardi' WHERE id=$1",[owned.id]);
  await f.database.query("UPDATE units SET source_system='yardi',availability_source='yardi' WHERE id=$1",[ownedUnit.id]);
  const analyst=await f.createStaff('analyst','read_only_analyst',[fixtures[0].id]);
  await f.json('/api/property-foundation/properties/'+owned.id+'/units/'+ownedUnit.id,'staff','PATCH',{label:'Forbidden overwrite'},409);
  await f.json('/api/property-foundation/properties/'+fixtures[0].id,'foreign','GET',undefined,404);
  const web=await createServer({configFile:false,root:path.join(f.root,'client'),publicDir:path.join(f.root,'public'),envDir:false,envPrefix:[],server:{host:'127.0.0.1',port:0,proxy:{'/api':{target:f.apiBase,changeOrigin:false}}},logLevel:'error'});
  try {
   await web.listen();const address=web.httpServer?.address();assert(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;Object.assign(f.config,{appUrl:base});
   const child=await promisify(execFile)(process.execPath,[path.join(f.root,'scripts/check-properties-refinement-browser.mjs')],{cwd:f.root,windowsHide:true,timeout:180000,maxBuffer:1000000,env:{...process.env,OOTLA_PROPERTIES_UI_URL:base,OOTLA_PROPERTIES_UI_CONTEXT:JSON.stringify({email:f.config.demoAdminEmail,password:f.config.demoAdminPassword,analystEmail:analyst.email,authorizedId:fixtures[0].id,ownedId:owned.id,ownedUnitId:ownedUnit.id})}});
   process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);
   assert.equal((await f.database.query("SELECT count(*)::int n FROM properties WHERE organization_id=$1 AND name='Refinement modal property'",[f.staff.organization.id])).rows[0].n,1);
   assert.equal((await f.database.query("SELECT count(*)::int n FROM property_groups WHERE organization_id=$1 AND name='Refinement modal group'",[f.staff.organization.id])).rows[0].n,1);
   assert.equal(f.outsideRequests(),0);
  } finally {await web.close();}
 });
} catch(e) {
 const failure=e as {stdout?:string;stderr?:string;message?:string};
 if(failure.stdout)process.stdout.write(failure.stdout);if(failure.stderr)process.stderr.write(failure.stderr.slice(0,3500));
 console.error(String(failure.message??e).slice(0,1000));process.exitCode=1;
}
