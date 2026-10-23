import { Router,raw,type Request,type RequestHandler,type Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import {screeningRequestSchema,screeningProcessSchema,screeningActionSchema,applicationDecisionSchema,screeningConsentSchema} from '../../shared/screening-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {protectOrigin} from '../middleware/security.js';
import {readSessionDigest} from '../services/sessions.js';
import {ApplicantPortal,type ApplicantPrincipal} from '../services/applicant-portal.js';
import {ScreeningService} from '../services/screening.js';
const empty=z.object({}).strict();
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ApiError(400,'INVALID_INPUT','Check the screening action, identifiers and required values.');return result.data;}
function body<T>(r:Request,s:z.ZodType<T>):T{if(!r.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send screening actions as application/json.');return parse(s,r.body);}
const id=(v:unknown)=>parse(z.uuid(),v),staff=(r:Response)=>r.locals.user as AuthUser;
function security(config:ServerConfig):RequestHandler{return(r,s,next)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');if(!['GET','HEAD','OPTIONS'].includes(r.method))return protectOrigin(config)(r,s,next);next();};}
export function createScreeningRouter(config:ServerConfig,database:Database,requireUser:RequestHandler):Router{
 const router=Router(),service=new ScreeningService(database,config);
 const digest=(r:Request)=>{const d=readSessionDigest(r,config);if(!d)throw new ApiError(401,'AUTH_REQUIRED','Sign in to the Ootla staff workspace.');return d;};
 router.use(security(config),requireUser,(r,_s,next)=>{parse(empty,r.query);next();});
 router.get('/:id/screening',async(r,s)=>s.json(await service.workspace(staff(s),digest(r),id(r.params.id))));
 router.post('/:id/screening/requests',async(r,s)=>s.json(await service.request(staff(s),digest(r),id(r.params.id),body(r,screeningRequestSchema))));
 router.post('/:id/screening/process',async(r,s)=>s.json(await service.process(staff(s),digest(r),id(r.params.id),body(r,screeningProcessSchema))));
 router.post('/:id/screening/retry',async(r,s)=>s.json(await service.retry(staff(s),digest(r),id(r.params.id),body(r,screeningActionSchema))));
 router.post('/:id/screening/review',async(r,s)=>s.json(await service.review(staff(s),digest(r),id(r.params.id),body(r,screeningActionSchema))));
 router.post('/:id/decisions',async(r,s)=>s.json(await service.decision(staff(s),digest(r),id(r.params.id),body(r,applicationDecisionSchema))));
 router.get('/:id/screening/:screeningId/report',async(r,s)=>{const result=await service.report(staff(s),digest(r),id(r.params.id),id(r.params.screeningId));s.setHeader('Content-Type','text/plain; charset=utf-8');s.setHeader('Content-Disposition','attachment; filename="'+result.name+'"');s.setHeader('X-Content-Type-Options','nosniff');s.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");s.send(result.content);});
 return router;
}
export function createApplicantScreeningRouter(config:ServerConfig,database:Database):Router{
 const router=Router(),portal=new ApplicantPortal(database,config),service=new ScreeningService(database,config);
 router.use(security(config),async(r,s,next)=>{parse(empty,r.query);const current=await portal.currentUser(r);if(!current)throw new ApiError(401,'APPLICANT_AUTH_REQUIRED','Sign in to your applicant portal.');s.locals.applicant=current;next();});
 const applicant=(s:Response)=>s.locals.applicant as ApplicantPrincipal;
 router.get('/:id/screening-consent',async(r,s)=>s.json(await service.consent(applicant(s),id(r.params.id))));
 router.post('/:id/screening-consent',async(r,s)=>{body(r,screeningConsentSchema);s.json(await service.consent(applicant(s),id(r.params.id),true));});
 return router;
}
/** Mount before the global JSON parser: verification uses exact bytes, never a reserialized body. */
export function createScreeningDemoCallbackRouter(config:ServerConfig,database:Database):Router{
 const router=Router(),service=new ScreeningService(database,config);
 router.post('/demo-callback',raw({type:'application/json',limit:'8kb'}),async(r,s)=>{
  s.setHeader('Cache-Control','no-store');parse(empty,r.query);
  if(!r.is('application/json')||!Buffer.isBuffer(r.body))throw new ApiError(400,'SCREENING_CALLBACK_INVALID','The synthetic callback requires its exact JSON body.');
  s.json(await service.acceptDemoCallback(r.body,String(r.headers['x-ootla-demo-timestamp']??''),String(r.headers['x-ootla-demo-signature']??'')));
 });return router;
}
