import {Router,type Request,type Response,type RequestHandler} from 'express';
import type {AuthUser} from '../../shared/contracts.js';
import {renewalDirectorySchema,renewalDetailSchema,renewalTermsSchema,renewalOptionsSchema} from '../../shared/renewal-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {readSessionDigest} from '../services/sessions.js';
import {Renewals} from '../services/renewals.js';
import {residentParse as parse,residentBody as body,residentId as id,residentRouteSecurity as security} from './resident-http.js';
export function createRenewalsRouter(config:ServerConfig,db:Database,requireUser:RequestHandler):Router{
 const router=Router(),service=new Renewals(db,config),user=(r:Response)=>r.locals.user as AuthUser,digest=(r:Request)=>{const value=readSessionDigest(r,config);if(!value)throw new ApiError(401,'AUTH_REQUIRED','Sign in to the current staff workspace.');return value;};
 router.use(security(config),requireUser);
 router.get('/',async(q,s)=>s.json(await service.list(user(s),digest(q),parse(renewalDirectorySchema,q.query))));
 router.get('/options',async(q,s)=>s.json(await service.propertyOptions(user(s),digest(q),parse(renewalOptionsSchema,q.query))));
 router.get('/:id',async(q,s)=>s.json(await service.detail(user(s),digest(q),id(q.params.id),parse(renewalDetailSchema,q.query))));
 router.post('/:id/terms',async(q,s)=>s.json(await service.publish(user(s),digest(q),id(q.params.id),body(q,renewalTermsSchema))));
 return router;
}
