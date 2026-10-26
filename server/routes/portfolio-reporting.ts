import {Router,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {portfolioQuerySchema,reportingOptionsSchema,reportingRegionSchema} from '../../shared/reporting-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {protectOrigin} from '../middleware/security.js';
import {readSessionDigest} from '../services/sessions.js';
import {PortfolioReportingService} from '../services/portfolio-reporting.js';
const empty=z.object({}).strict();
function parse<T>(schema:z.ZodType<T>,v:unknown):T{const r=schema.safeParse(v);if(!r.success)throw new ApiError(400,'REPORTING_INVALID_INPUT','Check the report dates, filters, pagination and region settings.');return r.data;}
export function createPortfolioReportingRouter(config:ServerConfig,db:Database,requireUser:RequestHandler):Router{
 const r=Router(),service=new PortfolioReportingService(db,config),actor=(s:Response)=>s.locals.user as AuthUser,digest=(q:Request)=>{const d=readSessionDigest(q,config);if(!d)throw new ApiError(401,'AUTH_REQUIRED','Sign in to the current staff organization.');return d;};
 r.use((q,s,next)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');if(!['GET','HEAD','OPTIONS'].includes(q.method))return protectOrigin(config)(q,s,next);next();},requireUser);
 r.get('/',async(q,s)=>s.json(await service.report(actor(s),digest(q),parse(portfolioQuerySchema,q.query))));
 r.get('/options',async(q,s)=>s.json(await service.options(actor(s),digest(q),parse(reportingOptionsSchema,q.query))));
 r.get('/export',async(q,s)=>{const result=await service.export(actor(s),digest(q),parse(portfolioQuerySchema,q.query));s.setHeader('Content-Type','text/csv; charset=utf-8');s.setHeader('Content-Disposition','attachment; filename="'+result.filename+'"');s.setHeader('X-Content-Type-Options','nosniff');s.setHeader('X-Ootla-Export-Rows',String(result.rowCount));s.send(result.csv);});
 r.put('/regions',async(q,s)=>{parse(empty,q.query);if(!q.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send reporting settings as application/json.');s.json(await service.region(actor(s),digest(q),parse(reportingRegionSchema,q.body)));});
 return r;
}
