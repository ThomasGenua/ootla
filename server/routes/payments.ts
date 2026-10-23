import {Router,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {paymentActionSchema,paymentDestinationSchema,paymentDemoOpenSchema,paymentDemoConfirmSchema} from '../../shared/payment-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {protectOrigin} from '../middleware/security.js';
import {readSessionDigest} from '../services/sessions.js';
import {ApplicantPortal,type ApplicantPrincipal} from '../services/applicant-portal.js';
import {PaymentService} from '../services/payments.js';
const empty=z.object({}).strict();
function parse<T>(s:z.ZodType<T>,v:unknown):T{const result=s.safeParse(v);if(!result.success)throw new ApiError(400,'INVALID_INPUT','Check the approved destination or payment handoff action. Browser return parameters cannot verify a payment.');return result.data;}
function body<T>(r:Request,s:z.ZodType<T>):T{if(!r.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send handoff changes as application/json.');return parse(s,r.body);}
const id=(v:unknown)=>parse(z.uuid(),v),staff=(r:Response)=>r.locals.user as AuthUser;
function security(config:ServerConfig):RequestHandler{return(r,s,next)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');parse(empty,r.query);if(!['GET','HEAD','OPTIONS'].includes(r.method))return protectOrigin(config)(r,s,next);next();};}
export function createStaffPaymentsRouter(config:ServerConfig,database:Database,requireUser:RequestHandler):Router{
 const router=Router(),service=new PaymentService(database,config);
 const digest=(r:Request)=>{const d=readSessionDigest(r,config);if(!d)throw new ApiError(401,'AUTH_REQUIRED','Sign in to the Ootla staff workspace.');return d;};
 router.use(security(config),requireUser);
 router.get('/destinations',async(r,s)=>s.json(await service.destinations(staff(s),digest(r))));
 router.post('/destinations',async(r,s)=>s.json(await service.saveDestination(staff(s),digest(r),body(r,paymentDestinationSchema))));
 router.get('/:id',async(r,s)=>s.json(await service.staffWorkspace(staff(s),digest(r),id(r.params.id))));
 router.post('/:id/verify',async(r,s)=>s.json(await service.staffVerify(staff(s),digest(r),id(r.params.id),body(r,paymentActionSchema))));
 return router;
}
function applicantSecurity(config:ServerConfig,database:Database):RequestHandler[]{
 const portal=new ApplicantPortal(database,config);
 return[security(config),async(r,s,next)=>{const current=await portal.currentUser(r);if(!current)throw new ApiError(401,'APPLICANT_AUTH_REQUIRED','Sign in to your own applicant portal.');s.locals.applicant=current;next();}];
}
const applicant=(r:Response)=>r.locals.applicant as ApplicantPrincipal;
export function createApplicantPaymentsRouter(config:ServerConfig,database:Database):Router{
 const router=Router(),service=new PaymentService(database,config);
 router.use(...applicantSecurity(config,database));
 router.get('/:id',async(r,s)=>s.json(await service.applicantWorkspace(applicant(s),id(r.params.id))));
 router.post('/:id/handoff',async(r,s)=>s.json(await service.handoff(applicant(s),id(r.params.id),body(r,paymentActionSchema))));
 router.post('/:id/verify',async(r,s)=>s.json(await service.applicantVerify(applicant(s),id(r.params.id),body(r,paymentActionSchema))));
 return router;
}
export function createPaymentDemoRouter(config:ServerConfig,database:Database):Router{
 const router=Router(),service=new PaymentService(database,config);
 router.use(...applicantSecurity(config,database));
 router.post('/open',async(r,s)=>s.json(await service.openDemo(applicant(s),body(r,paymentDemoOpenSchema).token)));
 router.post('/confirm',async(r,s)=>s.json(await service.confirmDemo(applicant(s),body(r,paymentDemoConfirmSchema))));
 return router;
}
