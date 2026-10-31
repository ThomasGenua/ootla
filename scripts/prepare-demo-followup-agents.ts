import '../server/config/environment.js';
import {loadConfig}from'../server/config/env.js';import{Database}from'../server/db/pool.js';import{prepareFollowupAgents}from'../server/services/demo-followup-agents.js';
const config=loadConfig(),db=new Database(config);try{console.log(JSON.stringify(await prepareFollowupAgents(db,config)));}finally{await db.close();}
