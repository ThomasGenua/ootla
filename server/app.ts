import {publicDemoAccess,installPublicAccess} from './http/public-access.js';
import {rewritePublicAccess} from '../shared/public-access.js';
import {createStaffOnboardingRouter} from './routes/staff-onboarding.js';
import {installPreviewEntry} from './http/preview-entry.js';
import {createOperationsRouter} from './routes/operations.js';
import {createOrganizationAdminRouter} from './routes/organization-admin.js';
import {createVoiceRouter} from './routes/voice.js';
﻿import {createResidentPortalRouter} from './routes/resident-portal.js';
import {createMaintenanceRouter} from './routes/maintenance.js';
import {residentOperationsAskCapability} from './services/ask-resident.js';
import { existsSync,readFileSync } from 'node:fs';
import { createAiRouter } from './routes/ai.js';
import {createPortfolioReportingRouter} from './routes/portfolio-reporting.js';
import {portfolioAskCapability} from './services/ask-reporting.js';
import {createGoogleAnalyticsRouter} from './routes/google-analytics.js';
import {createAutomationRouter} from './routes/automations.js';
import {registerAskOotlaCapability} from './services/ask-ootla.js';
import {automationAskCapability} from './services/ask-automation.js';
import {createAskRouter,createConversationRouter,createPublicConversationRouter} from './routes/conversations.js';
import { createApplicantPortalRouter, createApplicationStaffRouter } from './routes/applicant-portal.js';
import { ApplicantPortal } from './services/applicant-portal.js';
import { createLeaseWorkflowRouter } from './routes/lease-workflow.js';
import { createStaffPaymentsRouter, createApplicantPaymentsRouter, createPaymentDemoRouter } from './routes/payments.js';
import { createScreeningRouter, createApplicantScreeningRouter, createScreeningDemoCallbackRouter } from './routes/screening.js';
import path from 'node:path';
import { installPublicSiteHttp } from './http/public-site.js';
import { isPublicPage } from '../shared/public-site.js';
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import { dashboardPeriodSchema, loginSchema, type DashboardPeriod, type AdminOverview, type AuthUser, type HealthResponse, type PublicConfig } from '../shared/contracts.js';
import type { ServerConfig } from './config/env.js';
import type { Database } from './db/pool.js';
import { ApiError } from './http/errors.js';
import { loginRateLimit, protectOrigin } from './middleware/security.js';
import { SessionService } from './services/sessions.js';
import { createGoogleCalendarRouter } from './routes/google-calendar.js';
import { createCalendarRouter,createPublicBookingRouter } from './routes/calendar.js';
import { createStaffRouter } from './routes/staff.js';
import { createLeadRouter } from './routes/leads.js';
import { createLeadWorkspaceRouter } from './routes/lead-workspace.js';
import { createTaskRouter } from './routes/tasks.js';
import { createImportRouter } from './routes/imports.js';
import { createAccountRouter } from './routes/account.js';
import { createConnectorRouter } from './routes/connectors.js';
import { createPropertyFoundationRouter } from './routes/property-foundation.js';
import { preparedDemoAccount } from './services/demo-environment.js';
import { preparedStandaloneDemo, standaloneDemoEmail } from './services/standalone-demo.js';
import { loadDemoData } from './services/demo-data.js';
import { loadDashboard } from './services/dashboard.js';
import { adminSummaryQuerySchema } from '../shared/admin-summary-contracts.js';
import { loadAdminPageSummary } from './services/admin-summary.js';

const frontendRoutes = new Set([
  '/staff/invite',
  '/admin/organization','/admin/integration-health','/admin/audit',
  '/admin/voice', '/resident','/resident/login','/resident/invite','/admin/maintenance', '/applicant', '/applicant/login', '/applicant/invite', '/payment-demo', '/book', '/', '/platform', '/ai-workflows', '/workflows/leasing', '/workflows/resident-support', '/integrations', '/contact', '/privacy', '/admin/login', '/admin',
  '/admin/leads', '/admin/contacts', '/admin/properties', '/admin/applications', '/admin/calendar',
  '/admin/reports', '/admin/automations', '/admin/conversations', '/admin/tasks', '/admin/imports', '/admin/profile', '/admin/settings', '/admin/analytics', '/admin/ai', '/admin/integrations',
]);

export function createApp(config: ServerConfig, database: Database) {
  registerAskOotlaCapability(automationAskCapability);
  registerAskOotlaCapability(portfolioAskCapability);
  registerAskOotlaCapability(residentOperationsAskCapability);
  const app = express();
  const sessions = new SessionService(database, config);
  const applicantSessions = new ApplicantPortal(database, config);
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyLoopback ? 'loopback' : false);
  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (config.production || config.serveCompiledClient) {
      if(config.production || config.secureCookies) response.setHeader('Strict-Transport-Security', 'max-age=31536000');
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    }
    next();
  });
  const clientDirectory = path.resolve(process.cwd(), 'dist/client');
  installPublicSiteHttp(app, config, clientDirectory);
  installPreviewEntry(app,config,database);
  installPublicAccess(app,config,database);
  app.use('/staff/invite',(_request,response,next)=>{response.setHeader('Cache-Control','no-store, private');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');next();});
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  // The larger upload envelope is scoped to authenticated standalone import uploads.
  app.post('/api/imports/upload', protectOrigin(config), async (request,response,next)=>{
    const user=await sessions.currentUser(request);
    if(!user)throw new ApiError(401,'AUTH_REQUIRED','Sign in to upload an import.');
    if(user.organization.role!=='organization_admin')throw new ApiError(403,'ADMIN_REQUIRED','An organization administrator must review imports.');
    next();
  }, express.json({limit:'12mb',strict:true}));
  // Demo callbacks verify their own exact raw bytes before the general JSON parser.
  app.use('/api/screening', createScreeningDemoCallbackRouter(config, database));
  app.use(express.json({ limit: '16kb', strict: true }));

  app.get('/api/health', async (_request, response) => {
    const state = await database.state();
    const result: HealthResponse = {
      status: state === 'ready' ? 'ok' : state === 'unconfigured' ? 'setup' : 'degraded',
      database: state,
    };
    response.status(state === 'unavailable' || state === 'migration-required' ? 503 : 200).json(result);
  });

  app.get('/api/config', async (_request, response) => {
    const state = await database.state();
    const result: PublicConfig = { appUrl: config.appUrl, databaseReady: state === 'ready', demoEnabled: false, integrationsMode: config.integrationsMode, outboundMode: config.outboundMode };
    if (state === 'unconfigured') result.setupMessage = 'PostgreSQL is not configured. Set DATABASE_URL, then run npm run db:migrate and npm run db:seed.';
    if (state === 'unavailable') result.setupMessage = 'PostgreSQL cannot be reached. Check that it is running and DATABASE_URL is correct.';
    if (state === 'migration-required') result.setupMessage = 'PostgreSQL is connected. Run npm run db:migrate, then npm run db:seed to prepare the isolated demo.';
    if (state === 'ready' && config.demoMode) {
      if (await preparedDemoAccount(config, database)) {
        result.demoEnabled = true;
        result.demoCredentials = { email: config.demoAdminEmail, password: config.demoAdminPassword };
      } else {
        result.setupMessage = 'Demo access is unavailable. Verify the isolated demo configuration and run npm run db:seed. Existing passwords and data are preserved.';
      }
    }
    if (state === 'ready' && config.demoMode && await preparedStandaloneDemo(config, database)) result.standaloneDemoCredentials = { email: standaloneDemoEmail, password: config.demoAdminPassword };
    response.json(result);
  });

  app.post('/api/auth/login', protectOrigin(config), loginRateLimit(), async (request, response) => {
    if (!request.is('application/json')) throw new ApiError(415, 'JSON_REQUIRED', 'Send sign-in details as application/json.');
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError(400, 'INVALID_LOGIN', 'Enter a valid email address and password.');
    const user = await sessions.login(request, response, parsed.data.email, parsed.data.password);
    response.json({ user });
  });

  const requireUser = async (request: Request, response: Response, next: NextFunction) => {
    const user = await sessions.currentUser(request);
    if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Sign in to open the Ootla workspace.');
    response.locals.user = user;
    next();
  };

  app.get('/api/auth/me', requireUser, (_request, response) => {
    response.json({ user: response.locals.user as AuthUser });
  });

  app.post('/api/auth/logout', protectOrigin(config), async (request, response) => {
    await sessions.logout(request, response);
    response.status(204).end();
  });

  const overview = async (user: AuthUser, period: DashboardPeriod): Promise<AdminOverview> => {
    const scope = user.organization.role === 'organization_admin';
    const parameters = [user.organization.id,scope,user.membershipId];
    const result = await database.query<{properties:number;leads:number;tasks:number;applications:number}>(`
      SELECT
        (SELECT count(*)::integer FROM properties p WHERE p.organization_id=$1 AND ($2 OR EXISTS(SELECT 1 FROM property_access_assignments a WHERE a.organization_id=p.organization_id AND a.property_id=p.id AND a.membership_id=$3))) AS properties,
        (SELECT count(*)::integer FROM leads l WHERE l.organization_id=$1 AND ($2 OR EXISTS(SELECT 1 FROM property_access_assignments a WHERE a.organization_id=l.organization_id AND a.property_id=l.property_id AND a.membership_id=$3))) AS leads,
        (SELECT count(*)::integer FROM tasks t WHERE t.organization_id=$1 AND ($2 OR EXISTS(SELECT 1 FROM property_access_assignments a WHERE a.organization_id=t.organization_id AND a.property_id=t.property_id AND a.membership_id=$3))) AS tasks,
        (SELECT count(*)::integer FROM applications application
          WHERE application.organization_id=$1
            AND ($2 OR EXISTS(SELECT 1 FROM property_access_assignments pa
              WHERE pa.organization_id=application.organization_id AND pa.property_id=application.property_id AND pa.membership_id=$3))
            AND ($2 OR NOT EXISTS(SELECT 1 FROM lead_property_interests li
              WHERE li.organization_id=application.organization_id AND li.lead_id=application.lead_id
                AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa
                  WHERE pa.organization_id=li.organization_id AND pa.property_id=li.property_id AND pa.membership_id=$3)))
        ) AS applications
    `,parameters);
    const demoOrganization = scope && (await database.query("SELECT id FROM organizations WHERE id=$1 AND environment='demo' AND slug='ootla-demo'",[user.organization.id])).rowCount;
    return {
      organization:user.organization,
      dashboard:await loadDashboard(database,user,period),
      counts:{properties:result.rows[0]?.properties??0,leads:result.rows[0]?.leads??0,tasks:result.rows[0]?.tasks??0,applications:result.rows[0]?.applications??0},
      modulesReady:false,
      demoEnabled:Boolean(demoOrganization && await preparedDemoAccount(config,database)),
      integrationsMode:config.integrationsMode,
      outboundMode:config.outboundMode,
    };
  };
  const overviewPeriod = (request: Request): DashboardPeriod => {
    const parsed = dashboardPeriodSchema.safeParse(request.query.period ?? 'month');
    if (!parsed.success) throw new ApiError(400, 'INVALID_PERIOD', 'Choose month, week or all for the dashboard period.');
    return parsed.data;
  };
  app.get('/api/admin/summary', requireUser, async (request, response) => {
    const parsed = adminSummaryQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ApiError(400, 'INVALID_SUMMARY_QUERY', 'Choose a supported admin page and month, week or all.');
    response.json(await loadAdminPageSummary(database,response.locals.user as AuthUser,parsed.data.page,parsed.data.period));
  });
  app.get('/api/admin/overview', requireUser, async (request, response) => {
    response.json(await overview(response.locals.user as AuthUser, overviewPeriod(request)));
  });
  app.get('/api/organizations/:organizationId/overview', requireUser, async (request, response) => {
    const user = response.locals.user as AuthUser;
    if (request.params.organizationId !== user.organization.id) {
      throw new ApiError(403, 'ORGANIZATION_DENIED', 'You do not have access to this organization.');
    }
    response.json(await overview(user, overviewPeriod(request)));
  });
  app.get('/api/demo/data', requireUser, async (_request,response)=> {
    response.json(await loadDemoData(config,database,response.locals.user as AuthUser));
  });
  app.use('/api/staff-onboarding',createStaffOnboardingRouter(config,database));
  app.use('/api/operations',createOperationsRouter(config,database,requireUser));
  app.use('/api/organization-admin',createOrganizationAdminRouter(config,database,requireUser));
  app.use('/api/voice',createVoiceRouter(config,database,requireUser));
  app.use('/api/resident',createResidentPortalRouter(config,database));
  app.use('/api/maintenance',createMaintenanceRouter(config,database,requireUser));
  app.use('/api/portfolio-reporting',createPortfolioReportingRouter(config,database,requireUser));
  app.use('/api/google-analytics',createGoogleAnalyticsRouter(config,database,requireUser));
  app.use('/api/google-calendar', createGoogleCalendarRouter(config,database,requireUser));
  app.use('/api/calendar', createCalendarRouter(config,database,requireUser));
  app.use('/api/public/calendar', createPublicBookingRouter(config,database));
  app.use('/book',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');next();});
  app.use('/api/account', createAccountRouter(config, database, requireUser));
  app.use('/api/connectors', createConnectorRouter(config, database, requireUser));
  app.use('/api/imports', createImportRouter(config, database, requireUser));
  app.use('/api/automations',createAutomationRouter(config,database,requireUser));
  app.use('/api/ask', createAskRouter(config,database,requireUser));
  app.use('/api/conversations', createConversationRouter(config,database,requireUser));
  app.use('/api/public-conversations', createPublicConversationRouter(config,database));
  app.use('/api/ai', createAiRouter(config, database, requireUser));
  app.use('/api/application-leases', createLeaseWorkflowRouter(config, database, requireUser));
  app.use('/api/application-payments', createStaffPaymentsRouter(config, database, requireUser));
  app.use('/api/applicant/application-payments', createApplicantPaymentsRouter(config, database));
  app.use('/api/payment-demo', createPaymentDemoRouter(config, database));
  app.use('/payment-demo', (_request,response,next)=>{response.setHeader('Cache-Control','no-store, private');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('X-Robots-Tag','noindex, nofollow');next();});
  app.use('/api/application-journey', createScreeningRouter(config, database, requireUser));
  app.use('/api/applicant/application-journey', createApplicantScreeningRouter(config, database));
  app.use('/api/applicant', createApplicantPortalRouter(config, database));
  app.use('/api/applications', createApplicationStaffRouter(config, database, requireUser));
  app.use('/api/tasks', createTaskRouter(config, database, requireUser));
  app.use('/api/lead-workspaces', createLeadWorkspaceRouter(config, database, requireUser));
  app.use('/api/leads', createLeadRouter(config, database, requireUser));
  app.use('/api/property-foundation', createPropertyFoundationRouter(config, database, requireUser));
  app.use('/api', createStaffRouter(config, database, requireUser));

  // An API miss always stays JSON, including when HTML was requested.
  app.use('/api', (_request, _response) => {
    throw new ApiError(404, 'API_NOT_FOUND', 'This API route does not exist.');
  });

  if (config.production || config.serveCompiledClient) {
    const indexFile = path.join(clientDirectory, 'index.html');
    // Gate page navigation before static serving, so /admin and /admin/... cannot leak a protected view.
    app.use(async (request, response, next) => {
      const route = request.path.replace(/\/$/, '') || '/';
      if ((request.method === 'GET' || request.method === 'HEAD') && frontendRoutes.has(route) && route.startsWith('/admin') && route !== '/admin/login') {
        const user = await sessions.currentUser(request);
        if (!user) {
          response.redirect(302, '/admin/login');
          return;
        }
        response.setHeader('Cache-Control', 'no-store');
      }
      if ((request.method === 'GET' || request.method === 'HEAD') && route.startsWith('/applicant') && frontendRoutes.has(route)) {
        response.setHeader('Cache-Control', 'no-store, private');
        response.setHeader('Referrer-Policy', 'no-referrer');
        if (route === '/applicant' && !await applicantSessions.currentUser(request)) {
          response.redirect(302, '/applicant/login');
          return;
        }
      }
      next();
    });
    app.use(express.static(clientDirectory, { index: false, dotfiles: 'deny', fallthrough: true, redirect: false }));
    app.use(async (request, response, next) => {
      const route = request.path.replace(/\/$/, '') || '/';
      if ((request.method === 'GET' || request.method === 'HEAD') && frontendRoutes.has(route) && existsSync(indexFile)) {
        response.setHeader('Cache-Control', route==='/staff/invite'?'no-store, private':route.startsWith('/applicant') || route === '/payment-demo' || route === '/book' || (route.startsWith('/admin') && route !== '/admin/login') ? 'no-store' : 'no-cache');
        const publicFile = route === '/' ? indexFile : path.join(clientDirectory, route.slice(1), 'index.html');
        const documentFile = isPublicPage(route) && existsSync(publicFile) ? publicFile : path.join(clientDirectory, 'app-shell.html');
        if(isPublicPage(route)){response.setHeader('Cache-Control','no-store');response.type('html').send(rewritePublicAccess(readFileSync(documentFile,'utf8'),await publicDemoAccess(config,database)));}
        else response.sendFile(documentFile);
        return;
      }
      next();
    });
  }

  app.use((_request, response) => {
    response.status(404).type('text/plain').send('Page or asset not found.');
  });
  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (response.headersSent) return;
    if (error instanceof ApiError) {
      response.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    const parserError = error as { type?: string; status?: number };
    if (parserError?.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'The request body is not valid JSON.', code: 'INVALID_JSON' });
      return;
    }
    if (parserError?.type === 'entity.too.large') {
      response.status(413).json({ error: 'The request body is too large.', code: 'BODY_TOO_LARGE' });
      return;
    }
    console.error('An Ootla request failed. Request details and credentials are intentionally omitted.');
    response.status(500).json({ error: 'This request could not be completed. Please try again.', code: 'INTERNAL_ERROR' });
  };
  app.use(errorHandler);
  return app;
}


