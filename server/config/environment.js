import {config as configure} from 'dotenv';
/** Load exactly one private runtime file. Production may instead receive systemd EnvironmentFile values. */
export function loadRuntimeEnvironment(){
 const selected=process.env.OOTLA_ENV_FILE?.trim();
 if(selected){const loaded=configure({path:selected,override:false,quiet:true});if(loaded.error)throw new Error('OOTLA_ENV_FILE could not be read. No fallback configuration was loaded.');}
 else if(process.env.NODE_ENV!=='production')configure({override:false,quiet:true});
}
loadRuntimeEnvironment();
