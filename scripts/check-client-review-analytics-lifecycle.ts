import '../server/config/environment.js';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {loadConfig} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
import {proveAnalyticsReadLifecycle} from './lib/client-review-analytics-proof.js';
const config=loadConfig();assert(config.demoMode&&!config.production&&config.databaseName==='ootla_demo');const db=new Database(config);
try{await db.requireReady();const baseline=JSON.parse(await readFile('.local/client-review-before.json','utf8'));const {result}=await proveAnalyticsReadLifecycle(db,baseline);await writeFile('.local/client-review-analytics-lifecycle-observations.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}finally{await db.close();}
