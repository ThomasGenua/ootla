import { z } from 'zod';
export const googleCalendarSelectionSchema=z.object({calendarIds:z.array(z.string().min(1).max(1024)).min(1).max(10),writeCalendarId:z.string().min(1).max(1024)}).strict().refine(v=>new Set(v.calendarIds).size===v.calendarIds.length&&v.calendarIds.includes(v.writeCalendarId));
export const googleCalendarBusySchema=z.object({from:z.iso.datetime({offset:true}),until:z.iso.datetime({offset:true})}).strict().refine(v=>Date.parse(v.until)>Date.parse(v.from)&&Date.parse(v.until)-Date.parse(v.from)<=32*86400000);
export const googleCalendarPageSchema=z.object({pageToken:z.string().min(1).max(4096).optional()}).strict();
export interface GoogleCalendarChoice{id:string;name:string;timeZone:string;accessRole:string;selected:boolean;writable:boolean}
export interface GoogleCalendarStatus{
 state:'not_configured'|'demo'|'connecting'|'connected'|'degraded'|'revoked'|'disconnected';
 configured:boolean;canConnect:boolean;canManage:boolean;localSchedulingAvailable:true;demo:boolean;
 notice:string;lastSuccessfulSync:string|null;lastError:string|null;
 selectedCalendars:{id:string;name:string;timeZone:string;writable:boolean;writeTarget:boolean;lastSuccessfulSync:string|null;state:string}[];
 jobs:{pending:number;failed:number};invitations:'disabled';ownership:'ootla_only';coverage:{from:string;until:string}|null;
}
export interface GoogleCalendarChoices{items:GoogleCalendarChoice[];nextPageToken:string|null}
export interface GoogleCalendarBusy{items:{id:string;startsAt:string;endsAt:string;title:'Busy';allDay:boolean}[];lastSuccessfulSync:string|null;coverage:{from:string;until:string}|null;notice:string}
export interface GoogleViewingSync{localBooking:'saved';googleStatus:'not_configured'|'pending'|'synced'|'failed'|'conflict'|'cancelled'|'disconnected';lastSuccessfulSync:string|null;message:string}
