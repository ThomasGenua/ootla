import {readFileSync} from 'node:fs';
import {parse} from 'dotenv';
import {loadConfig,ConfigurationError} from '../server/config/env.js';
import {validateRuntimePair} from '../server/config/runtime-pair.js';
try{
 const args=process.argv.slice(2);if(args.length!==2)throw new ConfigurationError('Usage: validate-runtime-pair <private-customer-env-file> <private-preview-env-file>.');
 const read=(file:string)=>loadConfig(parse(readFileSync(file)));
 validateRuntimePair(read(args[0]!),read(args[1]!));
 console.log('PASS separate hosted customer/preview origins, database roles/names, cookie names, session/encryption secrets and preview provider restrictions. Database privileges and TLS must also be verified on the target. Secret values are omitted.');
}catch(issue){console.error(issue instanceof ConfigurationError?issue.message:'Runtime pair could not be validated. Check the private configuration paths and permissions. Values are omitted.');process.exitCode=1;}
