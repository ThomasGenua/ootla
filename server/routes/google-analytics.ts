import {Router,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {analyticsQuerySchema,analyticsSelectionSchema,analyticsRequestSchema,analyticsPropertyQuerySchema,analyticsCrmOptionsSchema} from '../../shared/google-analytics-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {protectOrigin} from '../middleware/security.js';
import {readSessionDigest} from '../services/sessions.js';
import {GoogleAnalyticsService} from '../services/google-analytics.js';
import {GoogleAnalyticsTransport} from '../services/google-analytics-transport.js';
const empty=z.object({}).strict(),actor=(s:Response)=>s.locals.user as AuthUser;
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const r=schema.safeParse(value);if(!r.success)throw new ApiError(400,'ANALYTICS_INVALID_INPUT','Check the property, date range, comparison and pagination.');return r.data;}
function body<T>(q:Request,schema:z.ZodType<T>):T{parse(empty,q.query);if(!q.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send analytics settings as application/json.');return parse(schema,q.body);}
export function createGoogleAnalyticsRouter(config:ServerConfig,db:Database,requireUser:RequestHandler,transport=new GoogleAnalyticsTransport()):Router{
 const r=Router(),service=new GoogleAnalyticsService(db,config,transport),digest=(q:Request)=>{const d=readSessionDigest(q,config);if(!d)throw new ApiError(401,'AUTH_REQUIRED','Sign in to the current staff organization.');return d;};
 r.use((q,s,next)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');if(!['GET','HEAD','OPTIONS'].includes(q.method))return protectOrigin(config)(q,s,next);next();},requireUser);
 r.get('/',async(q,s)=>{parse(empty,q.query);s.json(await service.status(actor(s),digest(q)));});
 r.get('/crm-properties',async(q,s)=>s.json(await service.crmProperties(actor(s),digest(q),parse(analyticsCrmOptionsSchema,q.query))));
 r.get('/properties',async(q,s)=>s.json(await service.properties(actor(s),digest(q),parse(analyticsPropertyQuerySchema,q.query).pageToken)));
 r.get('/key-events',async(q,s)=>s.json(await service.keyEvents(actor(s),digest(q),parse(analyticsPropertyQuerySchema,q.query).pageToken)));
 r.post('/oauth/start',async(q,s)=>{body(q,analyticsRequestSchema);s.json(await service.start(actor(s),digest(q)));});
 r.get('/oauth/callback',async(q,s)=>{const input=z.object({state:z.string().regex(/^[a-f0-9]{64}$/),code:z.string().min(1).max(4096).optional(),error:z.string().min(1).max(128).optional()}).safeParse({state:q.query.state,code:q.query.code,error:q.query.error});let outcome='failed';if(input.success){try{await service.callback(actor(s),digest(q),input.data);outcome='connected';}catch{outcome=input.data.error?'denied':'failed';}}s.redirect(303,config.appUrl+'/admin/analytics?google='+outcome);});
 r.put('/selection',async(q,s)=>s.json(await service.select(actor(s),digest(q),body(q,analyticsSelectionSchema))));
 r.post('/disconnect',async(q,s)=>s.json(await service.disconnect(actor(s),digest(q),body(q,analyticsRequestSchema).requestKey)));
 r.get('/report',async(q,s)=>s.json(await service.report(actor(s),digest(q),parse(analyticsQuerySchema,q.query))));
 return r;
}
