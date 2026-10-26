import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {processAutomationJobs} from './automations.js';
/** Bounded durable discovery/execution. Rules remain paused until deliberately configured. */
export function startAutomationWorker(database:Database,config:ServerConfig):()=>Promise<void>{
 if(!config.databaseUrl)return async()=>undefined;
 let stopped=false,running:Promise<void>|null=null,lastWarning=0;
 const tick=()=>{
  if(stopped||running)return;
  running=(async()=>{
   const ready=(await database.query("SELECT to_regclass('public.automation_jobs') IS NOT NULL AS ready")).rows[0]?.ready;
   if(!ready)return;
   await processAutomationJobs(database,config,{limit:20});
  })().catch(()=>{if(Date.now()-lastWarning>60000){lastWarning=Date.now();console.error('Automation worker pass did not complete. Saved work remains subject to current permissions, pause and retry rules.');}}).finally(()=>{running=null;});
 };
 const timer=setInterval(tick,5000);timer.unref();tick();
 return async()=>{stopped=true;clearInterval(timer);await running;};
}
