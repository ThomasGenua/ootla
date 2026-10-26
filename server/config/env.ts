import './environment.js';
import { z } from 'zod';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVE_COMPILED_CLIENT: z.enum(['true','false']).default('false').transform(value=>value==='true'),
  COOKIE_SECURE: z.enum(['true','false']).default('false').transform(value=>value==='true'),
  TRUST_PROXY_LOOPBACK: z.enum(['true','false']).default('false').transform(value=>value==='true'),
  DATABASE_URL: z.string().trim().default(''),
  OOTLA_ENV_FILE:z.string().trim().max(4096).default(''),
  DATABASE_TLS_MODE:z.enum(['disable','verify-full']).default('disable'),
  DATABASE_TLS_CA_FILE:z.string().trim().max(4096).default(''),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  OOTLA_BIND_HOST:z.enum(['127.0.0.1','0.0.0.0','::1','::']).default('127.0.0.1'),
  APP_URL: z.string().trim().url(),
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_PREFIX:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).default('ootla'),
  PREVIEW_APP_URL:z.string().trim().default(''),
  AI_PROVIDER:z.enum(['disabled','simulated','openai']).default('simulated'),
  AI_MODEL:z.string().trim().max(150).default(''),
  AI_API_KEY:z.string().max(2000).default(''),
  AI_MAX_REQUESTS_PER_MINUTE:z.coerce.number().int().min(1).max(1000).default(20),
  AI_MAX_TOKENS_PER_REQUEST:z.coerce.number().int().min(256).max(100000).default(16000),
  AI_DAILY_TOKEN_BUDGET:z.coerce.number().int().min(256).max(100000000).default(200000),
  AI_DAILY_COST_BUDGET_MICROS:z.coerce.number().int().min(0).max(1000000000000).default(1000000),
  AI_INPUT_COST_MICROS_PER_MILLION:z.coerce.number().int().min(0).max(1000000000000).default(0),
  AI_OUTPUT_COST_MICROS_PER_MILLION:z.coerce.number().int().min(0).max(1000000000000).default(0),
  AI_TIMEOUT_MS:z.coerce.number().int().min(100).max(30000).default(8000),
  CONNECTOR_CREDENTIAL_KEY: z.string().default('').refine(value => value === '' || (/^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value, 'base64').length === 32 && Buffer.from(value, 'base64').toString('base64') === value), 'Use a base64-encoded 32-byte server-only key.'),
  GOOGLE_ANALYTICS_ENABLED:z.enum(['true','false']).default('false').transform(value=>value==='true'),
  GOOGLE_ANALYTICS_CLIENT_ID:z.string().trim().max(500).default(''),
  GOOGLE_ANALYTICS_CLIENT_SECRET:z.string().max(1000).default(''),
  GOOGLE_ANALYTICS_REDIRECT_URI:z.string().trim().max(1000).default(''),
  GOOGLE_ANALYTICS_TOKEN_KEY:z.string().default('').refine(value=>value===''||(/^[A-Za-z0-9+/]{43}=$/.test(value)&&Buffer.from(value,'base64').length===32&&Buffer.from(value,'base64').toString('base64')===value),'Use a base64-encoded 32-byte server-only key.'),
  GOOGLE_CALENDAR_ENABLED: z.enum(['true','false']).default('false').transform(value => value === 'true'),
  GOOGLE_CALENDAR_CLIENT_ID: z.string().trim().max(500).default(''),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().max(1000).default(''),
  GOOGLE_CALENDAR_REDIRECT_URI: z.string().trim().max(1000).default(''),
  GOOGLE_CALENDAR_TOKEN_KEY: z.string().default('').refine(value => value === '' || (/^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value,'base64').length === 32 && Buffer.from(value,'base64').toString('base64') === value), 'Use a base64-encoded 32-byte server-only key.'),
  DEMO_MODE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  DEMO_ADMIN_EMAIL: z.string().trim().toLowerCase().email().max(254).default('admin@demo.ootla.test'),
  INTEGRATIONS_MODE: z.literal('simulation').default('simulation'),
  OUTBOUND_MODE: z.literal('simulation').default('simulation'),
  DEMO_ADMIN_PASSWORD: z.string().min(12).max(128).default('OotlaDemo!2026'),
});

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function databaseNameFromUrl(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('protocol');
    const database = decodeURIComponent(parsed.pathname.slice(1));
    if (!parsed.hostname || !database || database.includes('/')) throw new Error('database');
    return database;
  } catch {
    throw new ConfigurationError('DATABASE_URL must be a valid PostgreSQL URL with a database name.');
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path[0]))].join(', ');
    throw new ConfigurationError(`Invalid server configuration: ${fields}. Check .env.example; SESSION_SECRET needs at least 32 characters. Values are intentionally omitted.`);
  }
  const values = parsed.data;
  const origin = new URL(values.APP_URL);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new ConfigurationError('APP_URL must be an HTTP(S) origin without a path, credentials, query or fragment.');
  }
  if (values.NODE_ENV === 'production' && origin.protocol !== 'https:') {
    throw new ConfigurationError('APP_URL must use HTTPS in production.');
  }
  const loopback=['localhost','127.0.0.1','[::1]'].includes(origin.hostname);
  if(values.SESSION_COOKIE_PREFIX.startsWith('__Host-')&&!(values.COOKIE_SECURE||values.NODE_ENV==='production'))throw new ConfigurationError('Host-prefixed session cookies require HTTPS secure cookies.');
  let previewAppUrl:string|null=null;
  if(values.PREVIEW_APP_URL){try{const preview=new URL(values.PREVIEW_APP_URL);if(!['http:','https:'].includes(preview.protocol)||preview.username||preview.password||preview.pathname!=='/'||preview.search||preview.hash||preview.origin===origin.origin||values.NODE_ENV==='production'&&preview.protocol!=='https:')throw Error('origin');previewAppUrl=preview.origin;}catch{throw new ConfigurationError('PREVIEW_APP_URL must be a separate HTTP(S) origin; production requires HTTPS.');}}
  if(values.SERVE_COMPILED_CLIENT && values.NODE_ENV!=='production' && !loopback && (!values.DEMO_MODE || origin.protocol!=='https:' || !values.COOKIE_SECURE)) {
    throw new ConfigurationError('A hosted compiled demo requires DEMO_MODE=true, an HTTPS APP_URL and COOKIE_SECURE=true. Keep its database isolated.');
  }
  if(values.COOKIE_SECURE && origin.protocol!=='https:') throw new ConfigurationError('COOKIE_SECURE requires an HTTPS APP_URL.');
  if (values.NODE_ENV === 'production' && values.DEMO_MODE) {
    throw new ConfigurationError('DEMO_MODE is forbidden in production. Use a separate development/demo environment.');
  }
  if(values.NODE_ENV==='production'&&values.AI_PROVIDER==='simulated')throw new ConfigurationError('Production AI cannot use scripted simulation. Set AI_PROVIDER=disabled or configure OpenAI.');
  if(values.AI_PROVIDER==='openai'&&values.DEMO_MODE)throw new ConfigurationError('Live AI is forbidden in DEMO_MODE. Keep simulation.');
  if(values.AI_PROVIDER==='openai'&&values.AI_API_KEY&&values.AI_MODEL&&(!values.AI_DAILY_COST_BUDGET_MICROS||!values.AI_INPUT_COST_MICROS_PER_MILLION||!values.AI_OUTPUT_COST_MICROS_PER_MILLION))throw new ConfigurationError('Live AI requires positive budgets and operator-verified token prices.');
  if(values.GOOGLE_ANALYTICS_ENABLED){
    if(values.DEMO_MODE)throw new ConfigurationError('Live Google Analytics is forbidden in DEMO_MODE. Use illustrative analytics or a separate non-demo deployment.');
    if(!values.GOOGLE_ANALYTICS_CLIENT_ID||!values.GOOGLE_ANALYTICS_CLIENT_SECRET||!values.GOOGLE_ANALYTICS_TOKEN_KEY||values.GOOGLE_ANALYTICS_REDIRECT_URI!==origin.origin+'/api/google-analytics/oauth/callback')throw new ConfigurationError('Google Analytics requires server credentials, a token encryption key and the exact APP_URL/api/google-analytics/oauth/callback redirect URI. Values are omitted.');
    if(origin.protocol!=='https:'&&!loopback)throw new ConfigurationError('Google Analytics requires HTTPS except on a loopback development origin.');
  }
  if (values.GOOGLE_CALENDAR_ENABLED) {
    if (values.DEMO_MODE) throw new ConfigurationError('Google Calendar live access is forbidden in DEMO_MODE. Use a separate non-demo deployment.');
    if (!values.GOOGLE_CALENDAR_CLIENT_ID || !values.GOOGLE_CALENDAR_CLIENT_SECRET || !values.GOOGLE_CALENDAR_TOKEN_KEY || values.GOOGLE_CALENDAR_REDIRECT_URI !== origin.origin + '/api/google-calendar/oauth/callback') throw new ConfigurationError('Google Calendar requires server client credentials, a token encryption key and the exact APP_URL/api/google-calendar/oauth/callback redirect URI. Values are omitted.');
    if (origin.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(origin.hostname)) throw new ConfigurationError('Google Calendar requires HTTPS except for a local loopback development origin.');
  }
  if((values.SERVE_COMPILED_CLIENT||values.NODE_ENV==='production')&&!values.DATABASE_URL)throw new ConfigurationError('DATABASE_URL is required for compiled/demo/production startup. Public development without PostgreSQL remains available with SERVE_COMPILED_CLIENT=false.');
  const databaseName = values.DATABASE_URL ? databaseNameFromUrl(values.DATABASE_URL) : null;
  let databaseCa:string|null=null;
  if(values.DATABASE_TLS_CA_FILE){if(values.DATABASE_TLS_MODE!=='verify-full'||!path.isAbsolute(values.DATABASE_TLS_CA_FILE))throw new ConfigurationError('DATABASE_TLS_CA_FILE requires verify-full and an absolute private certificate path.');try{databaseCa=readFileSync(values.DATABASE_TLS_CA_FILE,'utf8');if(databaseCa.length>1048576||!databaseCa.includes('-----BEGIN CERTIFICATE-----'))throw Error('certificate');}catch{throw new ConfigurationError('DATABASE_TLS_CA_FILE must be a readable PEM certificate bundle. Values are omitted.');}}
  if(values.DATABASE_URL){const dbUrl=new URL(values.DATABASE_URL);if(dbUrl.hash||[...dbUrl.searchParams.keys()].some(key=>/^ssl|^uselibpqcompat$/i.test(key)))throw new ConfigurationError('Use DATABASE_TLS_MODE and DATABASE_TLS_CA_FILE instead of DATABASE_URL TLS query options or fragments.');if(values.NODE_ENV==='production'&&!['127.0.0.1','localhost','[::1]'].includes(dbUrl.hostname)&&values.DATABASE_TLS_MODE!=='verify-full')throw new ConfigurationError('Remote production PostgreSQL requires DATABASE_TLS_MODE=verify-full.');}

  if (values.DEMO_MODE && values.DATABASE_URL && (new URL(values.DATABASE_URL).search || new URL(values.DATABASE_URL).hash)) {
    throw new ConfigurationError('DEMO_MODE database URLs must not contain query parameters or fragments. Use one explicit isolated database connection.');
  }
  if (values.DEMO_MODE && databaseName && !/^ootla_demo(?:_[a-z0-9_]+)?$/.test(databaseName)) {
    throw new ConfigurationError('DEMO_MODE requires a dedicated database named ootla_demo or ootla_demo_*.');
  }
  if (/^(replace|change)(?:[-_ ]|$)/i.test(values.SESSION_SECRET)) {
    throw new ConfigurationError('SESSION_SECRET must be a newly generated secret, not an example placeholder.');
  }
  return Object.freeze({
    ai:Object.freeze({provider:values.AI_PROVIDER,model:values.AI_MODEL,apiKey:values.AI_API_KEY,maxRequestsPerMinute:values.AI_MAX_REQUESTS_PER_MINUTE,maxTokensPerRequest:values.AI_MAX_TOKENS_PER_REQUEST,dailyTokenBudget:values.AI_DAILY_TOKEN_BUDGET,dailyCostBudgetMicros:values.AI_DAILY_COST_BUDGET_MICROS,inputCostMicrosPerMillion:values.AI_INPUT_COST_MICROS_PER_MILLION,outputCostMicrosPerMillion:values.AI_OUTPUT_COST_MICROS_PER_MILLION,timeoutMs:values.AI_TIMEOUT_MS}),
    nodeEnv: values.NODE_ENV,
    serveCompiledClient: values.SERVE_COMPILED_CLIENT || values.NODE_ENV==='production',
    secureCookies: values.COOKIE_SECURE || values.NODE_ENV==='production',
    trustProxyLoopback: values.TRUST_PROXY_LOOPBACK,
    databaseUrl: values.DATABASE_URL,
    environmentFile:values.OOTLA_ENV_FILE||null,
    databaseTls:Object.freeze({mode:values.DATABASE_TLS_MODE,caFile:values.DATABASE_TLS_CA_FILE||null,ca:databaseCa}),
    databaseName,
    port: values.PORT,
    bindHost:values.OOTLA_BIND_HOST,
    appUrl: origin.origin,
    sessionSecret: values.SESSION_SECRET,
    sessionCookiePrefix:values.SESSION_COOKIE_PREFIX,
    previewAppUrl,
    googleAnalytics:Object.freeze({enabled:values.GOOGLE_ANALYTICS_ENABLED,clientId:values.GOOGLE_ANALYTICS_CLIENT_ID,clientSecret:values.GOOGLE_ANALYTICS_CLIENT_SECRET,redirectUri:values.GOOGLE_ANALYTICS_REDIRECT_URI,tokenEncryptionKey:values.GOOGLE_ANALYTICS_TOKEN_KEY||null}),
    googleCalendar: Object.freeze({enabled:values.GOOGLE_CALENDAR_ENABLED,clientId:values.GOOGLE_CALENDAR_CLIENT_ID,clientSecret:values.GOOGLE_CALENDAR_CLIENT_SECRET,redirectUri:values.GOOGLE_CALENDAR_REDIRECT_URI,tokenEncryptionKey:values.GOOGLE_CALENDAR_TOKEN_KEY || null}),
    connectorCredentialKey: values.CONNECTOR_CREDENTIAL_KEY || null,
    demoMode: values.DEMO_MODE,
    demoAdminEmail: values.DEMO_ADMIN_EMAIL,
    demoAdminPassword: values.DEMO_ADMIN_PASSWORD,
    integrationsMode: values.INTEGRATIONS_MODE,
    outboundMode: values.OUTBOUND_MODE,
    production: values.NODE_ENV === 'production',
  });
}

export type ServerConfig = ReturnType<typeof loadConfig>;

/** Mutating utilities are deliberately restricted to Ootla databases. */
export function assertOotlaDatabase(config: ServerConfig): void {
  if (!config.databaseName || !/^ootla(?:_[a-z0-9_]+)?$/.test(config.databaseName)) {
    throw new ConfigurationError('Set DATABASE_URL to a dedicated Ootla database named ootla or ootla_*. No database was changed.');
  }
}

