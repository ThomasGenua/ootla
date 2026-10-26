import {assertRuntimeDatabaseIsolation} from '../server/runtime-isolation.js';
import {loadConfig,assertOotlaDatabase} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
import {purgeVoiceTranscripts} from '../server/services/voice.js';
const argument=process.argv.slice(2),match=argument.length===1?/^--limit=(\d{1,3})$/.exec(argument[0]!):null;
if(argument.length&&(!match||Number(match[1])<1||Number(match[1])>500))throw Error('Use no arguments or --limit=1..500.');
const config=loadConfig();assertOotlaDatabase(config);const db=new Database(config);
try{await db.requireReady();await assertRuntimeDatabaseIsolation(db,config);const result=await purgeVoiceTranscripts(db,config,{limit:match?Number(match[1]):100});console.info('Expired/off-policy voice transcript rows cleared: '+result.purged+'. Session outcomes and CRM records are retained.');}
catch{console.error('Voice retention pass failed. Check database/migrations; no telephony was contacted.');process.exitCode=1;}finally{await db.close();}
