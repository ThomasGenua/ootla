import type {Request,Response} from 'express';
import type {ImportEntity} from '../../shared/import-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {SessionService} from './sessions.js';
import {requireIsolatedDemo} from './demo-environment.js';
import {seedStandaloneDemo,standaloneDemoEmail} from './standalone-demo.js';
import {Imports,processImportBatches} from './imports.js';

export const demoImportShowcaseSource='ootla-showcase-v1';
interface ShowcaseImportFile{entity:ImportEntity;filename:string;csv:string;mapping:Record<string,string>}
function file(entity:ImportEntity,headers:string[],rows:string[][]):ShowcaseImportFile{
 const cell=(value:string)=>'"'+value.replaceAll('"','""')+'"';
 return{entity,filename:'ootla-showcase-'+entity+'.csv',mapping:Object.fromEntries(headers.map(h=>[h,h])),csv:[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'};
}
/** Stable content/source IDs also serve as downloadable examples; no real customer details are included. */
export const demoImportShowcaseFiles:ReadonlyArray<ShowcaseImportFile>=[
 file('properties',['sourceId','name','address','city','type'],[
  ['ST-P-01','Linden Court — standalone example','10 Linden Walk — illustrative address','Lagos','apartments'],
  ['ST-P-02','Willow House — standalone example','20 Willow Lane — illustrative address','Lagos','apartments'],
 ]),
 file('units',['sourceId','propertySourceId','label','bedrooms','monthlyRent','status'],[
  ['ST-U-01','ST-P-01','101','1','1600','available'],
  ['ST-U-02','ST-P-02','201','2','2200','available'],
 ]),
 file('contacts',['sourceId','displayName','email','phone','propertySourceId'],[
  ['ST-C-01','Morgan Reed — standalone example','morgan.standalone@example.test','+1 202 555 0181','ST-P-01'],
  ['ST-C-02','Casey Jordan — standalone example','casey.standalone@example.test','+1 202 555 0182','ST-P-02'],
  ['ST-C-INVALID','Invalid email example','invalid-address','','ST-P-01'],
 ]),
 file('leads',['sourceId','propertySourceId','contactSourceId','unitSourceId','intent','stage','nextAction'],[
  ['ST-L-01','ST-P-01','ST-C-01','ST-U-01','leasing','new_inquiry','Review the imported inquiry and arrange a viewing.'],
  ['ST-L-02','ST-P-02','ST-C-02','ST-U-02','leasing','new_inquiry','Discuss the customer’s stated move-in preferences.'],
 ]),
];
export interface DemoImportPreparation{
 organizationId:string;sourceName:string;changedRecords:number;completed:boolean;
 batches:Array<{entity:ImportEntity;id:string;status:string;created:number;invalid:number;needsReview:number}>;
 externalActions:'none';
}
const receiptDataset='demo.showcase.imports.v1';
async function counted(db:Database,org:string):Promise<number>{
 const tables=['properties','units','contacts','leads','import_batches','import_rows','external_record_mappings'];
 return Number((await db.query('SELECT '+tables.map(t=>'(SELECT count(*) FROM '+t+' WHERE organization_id=$1)').join('+')+' AS count',[org])).rows[0]?.count??0);
}
/** Explicit preparation only; actual CSV validation and durable processing create every imported CRM record. */
export async function prepareDemoImports(db:Database,config:ServerConfig):Promise<DemoImportPreparation>{
 await db.requireReady();await requireIsolatedDemo(config,db);
 if(config.ai.provider!=='simulated'||config.googleCalendar.enabled||config.googleAnalytics.enabled||config.integrationsMode!=='simulation'||config.outboundMode!=='simulation')throw new ApiError(409,'DEMO_SIMULATION_REQUIRED','Prepare imports only in the isolated simulation environment. No data was changed.');
 const standalone=await seedStandaloneDemo(db,config),org=standalone.organizationId;
 const prior=await db.transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[receiptDataset+':'+org]);
  return(await c.query("SELECT organization_id,action,metadata FROM audit_events WHERE organization_id=$1 AND action='demo.showcase.imports_prepared' AND metadata->>'dataset'=$2 ORDER BY id LIMIT 1",[org,receiptDataset])).rows[0];
 });
 if(prior){
  if(prior.organization_id!==org||prior.action!=='demo.showcase.imports_prepared'||!prior.metadata?.result)throw new ApiError(409,'DEMO_FIXTURE_CONFLICT','The import showcase identifier is already in use. Existing records were preserved.');
  return{...prior.metadata.result,changedRecords:0} as DemoImportPreparation;
 }
 const before=await counted(db,org),sessions=new SessionService(db,config);let cookie='';
 const response={cookie:(name:string,value:string)=>{cookie=name+'='+value;return response;},clearCookie:()=>response} as unknown as Response;
 const user=await sessions.login({headers:{}} as Request,response,standaloneDemoEmail,config.demoAdminPassword);
 try{
  if(user.organization.id!==org||user.organization.role!=='organization_admin')throw new ApiError(403,'DEMO_STANDALONE_ACTOR_REQUIRED','Use the isolated standalone demonstration administrator.');
  const imports=new Imports(db),batches:DemoImportPreparation['batches']=[];
  const result=(completed:boolean,changedRecords:number):DemoImportPreparation=>({organizationId:org,sourceName:demoImportShowcaseSource,changedRecords,completed,batches,externalActions:'none'});
  for(const sample of demoImportShowcaseFiles){
   let detail=await imports.upload(user,{entity:sample.entity,filename:sample.filename,sourceName:demoImportShowcaseSource,csv:sample.csv});
   // A prior upload is found by its source/entity/content hash. Do not overwrite staff remapping, review or undo.
   if(detail.batch.status==='uploaded')detail=await imports.map(user,detail.batch.id,{mapping:sample.mapping});
   if(detail.batch.status==='mapped'){
    if(JSON.stringify(Object.entries(detail.batch.mapping).sort())!==JSON.stringify(Object.entries(sample.mapping).sort()))throw new ApiError(409,'DEMO_IMPORT_MAPPING_PRESERVED','This example mapping was edited. Review it in Imports; preparation did not replace staff work.');
    detail=await imports.validate(user,detail.batch.id);
   }
   const append=()=>batches.push({entity:sample.entity,id:detail.batch.id,status:detail.batch.status,created:detail.batch.counts.created,invalid:detail.batch.counts.invalid,needsReview:detail.batch.counts.needs_review});
   if(detail.batch.counts.needs_review>0){append();return result(false,Math.max(0,(await counted(db,org))-before));}
   if(detail.batch.status==='review'){
    if(!detail.batch.canConfirm){append();return result(false,Math.max(0,(await counted(db,org))-before));}
    detail=await imports.confirm(user,detail.batch.id);
   }
   // Only the selected example batch is processed, never a different staff member’s import queue.
   for(let tick=0;tick<6&&['queued','running'].includes(detail.batch.status);tick++){
    await processImportBatches(db,{batchSize:10,batchId:detail.batch.id});
    detail=await imports.get(user,detail.batch.id);
   }
   append();
   if(detail.batch.status!=='completed'||detail.batch.counts.failed>0)return result(false,Math.max(0,(await counted(db,org))-before));
  }
  const prepared=result(true,Math.max(0,(await counted(db,org))-before));
  await db.transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[receiptDataset+':'+org]);
   if(!(await c.query("SELECT 1 FROM audit_events WHERE organization_id=$1 AND action='demo.showcase.imports_prepared' AND metadata->>'dataset'=$2",[org,receiptDataset])).rowCount)await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,'demo.showcase.imports_prepared',$3)",[org,user.id,JSON.stringify({dataset:receiptDataset,synthetic:true,outboundSent:false,result:prepared})]);
  });
  return prepared;
 }finally{if(cookie)await sessions.logout({headers:{cookie}} as Request,response);}
}
