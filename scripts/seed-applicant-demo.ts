import {assertOotlaDatabase,loadConfig}from'../server/config/env.js';
import{Database}from'../server/db/pool.js';import{seedApplicantDemo}from'../server/services/applicant-demo.js';
const config=loadConfig();assertOotlaDatabase(config);const database=new Database(config);
try{const result=await seedApplicantDemo(database,config);console.info('Applicant demo prepared: '+result.changedRecords+' new setup records. Existing users, passwords and staff work preserved.');}
catch{console.error('Applicant demo setup requires the isolated, migrated DEMO_MODE environment and unused reserved identities. No startup seed or reset is performed.');process.exitCode=1;}
finally{await database.close();}
