import {prepareDemoImports} from './demo-showcase-imports.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {assertRuntimeDatabaseIsolation} from '../runtime-isolation.js';
import {requireIsolatedDemo} from './demo-environment.js';
import {seedDemo} from './demo-seed.js';
import {seedApplicantDemo} from './applicant-demo.js';
import {seedResidentDemo} from './resident-demo.js';
import {seedStandaloneDemo} from './standalone-demo.js';
import {prepareDemoShowcase} from './demo-showcase.js';
import {prepareDemoCapabilities} from './demo-showcase-capabilities.js';

/** Explicit preparation only. Guards run before any additive setup; no startup import, reset or outbound delivery. */
export async function prepareDemoEnvironment(db:Database,config:ServerConfig){
 await db.requireReady();await assertRuntimeDatabaseIsolation(db,config);await requireIsolatedDemo(config,db);
 if(config.ai.provider!=='simulated'||config.googleCalendar.enabled||config.googleAnalytics.enabled||config.integrationsMode!=='simulation'||config.outboundMode!=='simulation')throw new ApiError(409,'DEMO_SIMULATION_REQUIRED','Demo preparation requires simulated AI and integrations, disabled live Google services and simulated outbound communication. No records were changed.');
 const base=await seedDemo(db,config),applicant=await seedApplicantDemo(db,config),resident=await seedResidentDemo(db,config),standalone=await seedStandaloneDemo(db,config);
 const showcase=await prepareDemoShowcase(db,config),capabilities=await prepareDemoCapabilities(db,config),imports=await prepareDemoImports(db,config);
 return{changedRecords:base.changedRecords+applicant.changedRecords+resident.changedRecords+standalone.changedRecords+showcase.changedRecords+capabilities.changedRecords+imports.changedRecords,base,applicant,resident,standalone,showcase,capabilities,imports,externalActions:'none' as const};
}
