import {ConfigurationError,type ServerConfig} from './env.js';
/** Validate the two hosted runtimes without exposing credentials or contacting either database. */
export function validateRuntimePair(customer:ServerConfig,preview:ServerConfig):void{
 const reject=(condition:boolean,message:string)=>{if(condition)throw new ConfigurationError(message);};
 reject(!customer.production||customer.demoMode,'Customer runtime requires NODE_ENV=production and DEMO_MODE=false.');
 reject(preview.production||!preview.demoMode||!preview.serveCompiledClient,'Preview runtime requires a separate compiled non-production DEMO_MODE runtime.');
 reject(customer.appUrl===preview.appUrl||Boolean(customer.previewAppUrl&&customer.previewAppUrl!==preview.appUrl),'APP_URL origins must differ; a legacy PREVIEW_APP_URL, if present, must match the preview origin.');
 reject(!customer.secureCookies||!preview.secureCookies||new URL(preview.appUrl).protocol!=='https:','Both hosted runtimes require HTTPS and secure cookies.');
 reject(new URL(customer.appUrl).hostname===new URL(preview.appUrl).hostname,'Use separate customer and preview hostnames; cookies do not separate ports.');
 reject(customer.bindHost===preview.bindHost&&customer.port===preview.port,'Customer and preview services require separate loopback ports.');
 reject(customer.sessionCookiePrefix===preview.sessionCookiePrefix,'Use distinct SESSION_COOKIE_PREFIX values for customer and preview runtimes.');
 reject(customer.sessionSecret===preview.sessionSecret,'Customer and preview SESSION_SECRET values must be independent.');
 reject(!customer.databaseUrl||!preview.databaseUrl,'Both runtimes require separate DATABASE_URL values.');
 const a=new URL(customer.databaseUrl),b=new URL(preview.databaseUrl);
 reject(customer.databaseName===preview.databaseName,'Customer and preview database names must be distinct.');
 reject(!a.username||!b.username||a.username===b.username,'Customer and preview database roles must be distinct and restricted to their own databases.');
 reject(/^ootla_demo(?:_|$)/.test(customer.databaseName??''),'A customer runtime cannot use a preview database.');
 reject(!/^ootla_demo(?:_[a-z0-9_]+)?$/.test(preview.databaseName??''),'Preview requires a dedicated ootla_demo database.');
 reject(preview.googleCalendar.enabled||preview.googleAnalytics.enabled||preview.ai.provider==='openai','Preview cannot enable live Google or AI provider actions.');
 reject(!customer.trustProxyLoopback||!preview.trustProxyLoopback||![customer.bindHost,preview.bindHost].every(h=>['127.0.0.1','::1'].includes(h)),'Apache runtimes require loopback bind/proxy settings.');
 for(const [name,x,y] of [['CONNECTOR_CREDENTIAL_KEY',customer.connectorCredentialKey,preview.connectorCredentialKey],['GOOGLE_CALENDAR_TOKEN_KEY',customer.googleCalendar.tokenEncryptionKey,preview.googleCalendar.tokenEncryptionKey],['GOOGLE_ANALYTICS_TOKEN_KEY',customer.googleAnalytics.tokenEncryptionKey,preview.googleAnalytics.tokenEncryptionKey]] as const)reject(Boolean(x&&y&&x===y),name+' must not be shared between runtimes.');
}
