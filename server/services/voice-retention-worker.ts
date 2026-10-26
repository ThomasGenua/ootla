import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {purgeVoiceTranscripts} from './voice.js';
/** Bounded retention enforcement only; never calls a telephony or AI provider. */
export function startVoiceRetentionWorker(db:Database,config:ServerConfig):()=>Promise<void>{
 if(!config.databaseUrl)return async()=>undefined;
 let stopped=false,running:Promise<void>|null=null,lastWarning=0;
 const tick=()=>{if(stopped||running)return;running=(async()=>{
  const ready=Boolean((await db.query("SELECT to_regclass('public.voice_transcripts') IS NOT NULL AS ready")).rows[0]?.ready);
  if(ready)await purgeVoiceTranscripts(db,config,{limit:100});
 })().catch(()=>{if(Date.now()-lastWarning>60000){lastWarning=Date.now();console.error('Voice retention pass did not complete; expired transcripts remain unavailable to readers.');}}).finally(()=>{running=null;});};
 const timer=setInterval(tick,60000);timer.unref();tick();
 return async()=>{stopped=true;clearInterval(timer);await running;};
}
