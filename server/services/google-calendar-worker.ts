import type { Database } from '../db/pool.js';
import type { ServerConfig } from '../config/env.js';
import { processGoogleCalendarJobs } from './google-calendar.js';
/** A bounded durable pass; never runs external work in demo or while disabled. */
export function startGoogleCalendarWorker(database:Database,config:ServerConfig):()=>Promise<void>{
 if(config.demoMode||!config.googleCalendar.enabled)return async()=>undefined;
 let stopped=false,running:Promise<void>|null=null;
 const tick=()=>{if(stopped||running)return;running=processGoogleCalendarJobs(config,database).then(()=>undefined).catch(()=>{console.error('Google Calendar worker pass failed. Local bookings remain saved.');}).finally(()=>{running=null;});};
 const timer=setInterval(tick,5000);timer.unref();tick();
 return async()=>{stopped=true;clearInterval(timer);await running;};
}
