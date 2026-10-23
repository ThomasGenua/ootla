import { Router,type Request,type Response,type RequestHandler } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import { calendarAvailabilitySchema,calendarBookSchema,calendarInvitationQuerySchema,calendarInvitationSchema,calendarOptionsSchema,calendarQuerySchema,calendarRequestSchema,calendarRescheduleSchema,calendarSettingsSchema,calendarSlotsSchema,calendarStatusSchema,publicCalendarBookSchema,publicCalendarReadSchema } from '../../shared/calendar-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { protectOrigin } from '../middleware/security.js';
import { Calendar } from '../services/calendar.js';
import { readSessionDigest } from '../services/sessions.js';
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ApiError(400,'INVALID_CALENDAR_INPUT','Check the viewing fields, dates, identifiers and pagination.');return result.data;}
const id=(value:unknown)=>parse(z.uuid(),value);
function body<T>(req:Request,schema:z.ZodType<T>):T{if(!req.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send calendar changes as application/json.');return parse(schema,req.body);}
const page=z.object({page:z.coerce.number().int().min(1).max(1000000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25)}).strict();
export function createCalendarRouter(config:ServerConfig,database:Database,requireUser:RequestHandler):Router{
 const router=Router(),calendar=new Calendar(database,config),user=(res:Response)=>res.locals.user as AuthUser;
 const digest=(req:Request)=>{const value=readSessionDigest(req,config);if(!value)throw new ApiError(401,'AUTH_REQUIRED','Sign in again.');return value;};
 router.use(requireUser,(req,res,next)=>{res.setHeader('Cache-Control','no-store');if(!['GET','HEAD','OPTIONS'].includes(req.method))return protectOrigin(config)(req,res,next);next();});
 router.get('/',async(req,res)=>res.json(await calendar.list(user(res),digest(req),parse(calendarQuerySchema,req.query))));
 router.get('/options',async(req,res)=>res.json(await calendar.options(user(res),digest(req),parse(calendarOptionsSchema,req.query))));
 router.get('/slots',async(req,res)=>res.json(await calendar.slots(user(res),digest(req),parse(calendarSlotsSchema,req.query))));
 router.get('/viewings/:id',async(req,res)=>res.json(await calendar.detail(user(res),digest(req),id(req.params.id),parse(page,req.query))));
 router.post('/viewings',async(req,res)=>res.status(201).json(await calendar.book(user(res),digest(req),body(req,calendarBookSchema))));
 router.post('/viewings/:id/reschedule',async(req,res)=>res.json(await calendar.reschedule(user(res),digest(req),id(req.params.id),body(req,calendarRescheduleSchema))));
 router.post('/viewings/:id/status',async(req,res)=>res.json(await calendar.status(user(res),digest(req),id(req.params.id),body(req,calendarStatusSchema))));
 router.put('/properties/:propertyId/settings',async(req,res)=>res.json(await calendar.configure(user(res),digest(req),id(req.params.propertyId),body(req,calendarSettingsSchema))));
 router.put('/properties/:propertyId/staff/:membershipId/availability',async(req,res)=>res.json(await calendar.setAvailability(user(res),digest(req),id(req.params.propertyId),id(req.params.membershipId),body(req,calendarAvailabilitySchema))));
 router.get('/invitations',async(req,res)=>res.json(await calendar.invitations(user(res),digest(req),parse(calendarInvitationQuerySchema,req.query))));
 router.post('/invitations',async(req,res)=>res.status(201).json(await calendar.invite(user(res),digest(req),body(req,calendarInvitationSchema))));
 router.post('/invitations/:id/revoke',async(req,res)=>res.json(await calendar.revoke(user(res),digest(req),id(req.params.id),body(req,calendarRequestSchema).requestKey)));
 return router;
}
export function createPublicBookingRouter(config:ServerConfig,database:Database):Router{
 const router=Router(),calendar=new Calendar(database,config),buckets=new Map<string,{count:number;until:number}>();
 router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');const now=Date.now();for(const[key,value]of buckets)if(value.until<=now)buckets.delete(key);const key=req.ip??'unknown';let value=buckets.get(key);if(!value){if(buckets.size>=10000)throw new ApiError(429,'BOOKING_LIMITED','Try this booking link later.');value={count:0,until:now+600000};buckets.set(key,value);}if(++value.count>100){res.setHeader('Retry-After','600');throw new ApiError(429,'BOOKING_LIMITED','Too many booking requests. Try again later.');}return protectOrigin(config)(req,res,next);});
 router.post('/availability',async(req,res)=>res.json(await calendar.publicRead(body(req,publicCalendarReadSchema))));
 router.post('/book',async(req,res)=>res.status(201).json(await calendar.publicBook(body(req,publicCalendarBookSchema))));
 return router;
}
