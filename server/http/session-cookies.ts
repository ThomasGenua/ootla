import type {Request} from 'express';
import type {ServerConfig} from '../config/env.js';
export type SessionIdentityKind='staff'|'applicant'|'resident';
/** Host-only cookies use a distinct runtime prefix; legacy preview names stay unchanged by default. */
export function sessionCookieName(config:Pick<ServerConfig,'sessionCookiePrefix'>,kind:SessionIdentityKind='staff'):string{
 return config.sessionCookiePrefix+(kind==='staff'?'.sid':'.'+kind+'.sid');
}
export function readSessionCookie(request:Pick<Request,'headers'>,config:Pick<ServerConfig,'sessionCookiePrefix'>,kind:SessionIdentityKind='staff'):string|null{
 const name=sessionCookieName(config,kind);
 const value=request.headers.cookie?.split(';').map(part=>part.trim()).find(part=>part.startsWith(name+'='))?.slice(name.length+1);
 return value&&/^[a-f0-9]{64}$/.test(value)?value:null;
}
