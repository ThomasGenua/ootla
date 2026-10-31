import '../server/config/environment.js';
import{readFile,writeFile}from'node:fs/promises';
import{loadConfig}from'../server/config/env.js';
import{Database}from'../server/db/pool.js';
import{proveAnalyticsReadLifecycle}from'./lib/demo-content-analytics-proof.js';
const db=new Database(loadConfig());try{const before=JSON.parse(await readFile('.local/demo-content-before.json','utf8'));const proof=await proveAnalyticsReadLifecycle(db,before);await writeFile('.local/demo-content-analytics-proof-observations.json',JSON.stringify(proof.result,null,2)+'\n');console.log(JSON.stringify(proof.result));}finally{await db.close();}
