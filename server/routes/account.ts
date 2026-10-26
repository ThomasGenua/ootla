import {sessionCookieName} from '../http/session-cookies.js';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import { accountPasswordUpdateSchema, accountPreferencesUpdateSchema, accountProfileUpdateSchema } from '../../shared/account-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { protectOrigin } from '../middleware/security.js';
import { AccountService, PasswordChangeLimited } from '../services/account.js';
import { readSessionDigest } from '../services/sessions.js';

function body<T>(request: Request,schema:z.ZodType<T>,message:string): T {
  if (!request.is('application/json')) throw new ApiError(415,'JSON_REQUIRED','Send account changes as application/json.');
  const parsed=schema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400,'INVALID_INPUT',message);
  return parsed.data;
}
const actor=(response:Response)=>response.locals.user as AuthUser;
export function createAccountRouter(config:ServerConfig,database:Database,requireUser:RequestHandler):Router {
  const router=Router(), account=new AccountService(database);
  router.use(requireUser,(request,response,next)=>{
    response.setHeader('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(request.method)) return protectOrigin(config)(request,response,next);
    next();
  });
  function digest(request:Request):string {
    const value=readSessionDigest(request,config);
    if (!value) throw new ApiError(401,'AUTH_REQUIRED','Your session ended. Sign in again.');
    return value;
  }
  router.get('/',async(request,response)=>response.json(await account.current(actor(response),digest(request))));
  router.patch('/profile',async(request,response)=>{
    response.json({profile:await account.updateProfile(actor(response),body(request,accountProfileUpdateSchema,'Check your display name, phone and job title.'),digest(request))});
  });
  router.patch('/preferences',async(request,response)=>{
    response.json({preferences:await account.updatePreferences(actor(response),body(request,accountPreferencesUpdateSchema,'Choose supported workspace preferences.'),digest(request))});
  });
  router.post('/password',async(request,response)=>{
    try {
      await account.changePassword(actor(response),body(request,accountPasswordUpdateSchema,'Passwords must match, use 12 to 128 characters and differ from the current password.'),digest(request));
    } catch(error) {
      if (error instanceof PasswordChangeLimited) response.setHeader('Retry-After',error.retryAfter);
      throw error;
    }
    // Match SessionService cookie attributes; the transaction has already revoked
    // every server-side session, including the current one.
    response.clearCookie(sessionCookieName(config),{httpOnly:true,sameSite:'lax',secure:config.production || config.secureCookies,path:'/'});
    response.json({signedOut:true});
  });
  return router;
}
