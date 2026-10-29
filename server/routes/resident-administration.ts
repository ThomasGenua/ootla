import {Router,type Request,type Response,type RequestHandler} from 'express';
import type {AuthUser} from '../../shared/contracts.js';
import {residentAdministrationDirectorySchema,residentAdministrationDetailSchema,residentAdministrationInvitationSchema,residentAdministrationGrantSchema,renewalOptionsSchema} from '../../shared/renewal-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {readSessionDigest} from '../services/sessions.js';
import {ResidentAdministration} from '../services/renewals.js';
import {residentParse as parse,residentBody as body,residentId as id,residentRouteSecurity as security} from './resident-http.js';
export function createResidentAdministrationRouter(config:ServerConfig,db:Database,requireUser:RequestHandler):Router{
 const router=Router(),service=new ResidentAdministration(db,config),user=(r:Response)=>r.locals.user as AuthUser,digest=(r:Request)=>{const value=readSessionDigest(r,config);if(!value)throw new ApiError(401,'AUTH_REQUIRED','Sign in to the current staff workspace.');return value;};
 router.use(security(config),requireUser);
 router.get('/',async(q,s)=>s.json(await service.directory(user(s),digest(q),parse(residentAdministrationDirectorySchema,q.query))));
 router.get('/options',async(q,s)=>s.json(await service.propertyOptions(user(s),digest(q),parse(renewalOptionsSchema,q.query),true)));
 router.get('/:id',async(q,s)=>s.json(await service.residentDetail(user(s),digest(q),id(q.params.id),parse(residentAdministrationDetailSchema,q.query))));
 router.post('/:id/invitations',async(q,s)=>s.json(await service.invite(user(s),digest(q),id(q.params.id),body(q,residentAdministrationInvitationSchema))));
 router.put('/:id/grants/:grantId',async(q,s)=>s.json(await service.grant(user(s),digest(q),id(q.params.id),id(q.params.grantId),body(q,residentAdministrationGrantSchema).active)));
 return router;
}
