import {config as configure} from 'dotenv';
import {resolveRuntimeEnvironmentFile} from './instance-files.js';
/** Load one explicit/branch-selected private runtime file. Production otherwise stays preloaded-only. */
export function loadRuntimeEnvironment(){
 const selected=resolveRuntimeEnvironmentFile();
 if(!selected.path)return;
 const loaded=configure({path:selected.path,override:false,quiet:true});
 if(loaded.error&&selected.required)throw new Error('The selected Ootla environment file could not be read. No fallback configuration was loaded.');
}
loadRuntimeEnvironment();
