import {Router,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {googleCalendarBusySchema,googleCalendarPageSchema,googleCalendarSelectionSchema} from '../../shared/google-calendar-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {protectOrigin} from '../middleware/security.js';
import {readSessionDigest} from '../services/sessions.js';
import {GoogleCalendarService} from '../services/google-calendar.js';
const actor=(r:Response)=>r.locals.user as AuthUser;
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ApiError(400,'INVALID_INPUT','Check Google Calendar input, dates and selections.');return result.data;}
function body<T>(request:Request,schema:z.ZodType<T>):T{if(!request.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send Google Calendar changes as application/json.');return parse(schema,request.body);}
const empty=z.object({}).strict();
export function createGoogleCalendarRouter(config:ServerConfig,database:Database,requireUser:RequestHandler):Router{
 const router=Router(),service=new GoogleCalendarService(database,config);
 const digest=(request:Request)=>{const v=readSessionDigest(request,config);if(!v)throw new ApiError(401,'AUTH_REQUIRED','Sign in to manage your Google Calendar connection.');return v;};
 router.use((_request,response,next)=>{response.setHeader('Cache-Control','no-store');response.setHeader('Referrer-Policy','no-referrer');next();},requireUser,(request,response,next)=>{if(!['GET','HEAD','OPTIONS'].includes(request.method))return protectOrigin(config)(request,response,next);next();});
 router.get('/',async(request,response)=>response.json(await service.status(actor(response),digest(request))));
 router.post('/oauth/start',async(request,response)=>{body(request,empty);response.json(await service.start(actor(response),digest(request)));});
 router.get('/oauth/callback',async(request,response)=>{
  const result=z.object({state:z.string().regex(/^[a-f0-9]{64}$/),code:z.string().min(1).max(4096).optional(),error:z.string().min(1).max(128).optional()}).safeParse({state:request.query.state,code:request.query.code,error:request.query.error});
  let outcome='failed';if(result.success){try{await service.callback(actor(response),digest(request),result.data);outcome='connected';}catch{outcome=result.data.error?'denied':'failed';}}
  response.redirect(303,config.appUrl+'/admin/calendar?view=google&google='+outcome);
 });
 router.get('/calendars',async(request,response)=>response.json(await service.calendars(actor(response),digest(request),parse(googleCalendarPageSchema,request.query).pageToken)));
 router.put('/selection',async(request,response)=>response.json(await service.select(actor(response),digest(request),body(request,googleCalendarSelectionSchema))));
 router.post('/sync',async(request,response)=>{body(request,empty);response.status(202).json(await service.sync(actor(response),digest(request)));});
 router.post('/retry',async(request,response)=>{body(request,empty);response.status(202).json(await service.retry(actor(response),digest(request)));});
 router.post('/disconnect',async(request,response)=>{body(request,empty);response.json(await service.disconnect(actor(response),digest(request)));});
 router.get('/busy',async(request,response)=>response.json(await service.busy(actor(response),digest(request),parse(googleCalendarBusySchema,request.query))));
 router.get('/viewings/:id',async(request,response)=>response.json(await service.viewing(actor(response),digest(request),parse(z.uuid(),request.params.id))));
 return router;
}
