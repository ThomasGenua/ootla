import {existsSync,lstatSync,readFileSync} from 'node:fs';
import path from 'node:path';
const invalid=()=>new Error('The Ootla instance marker is invalid. Use the matching tracked live or demo configuration; no fallback file was loaded.');
/** Read branch defaults only. This module never loads private environment values. */
export function readInstanceDefaults(root=process.cwd()){
 const marker=path.resolve(root,'ootla.instance.json');
 if(!existsSync(marker))return null;
 try{
  const stat=lstatSync(marker);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)throw invalid();
  const value=JSON.parse(readFileSync(marker,'utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='environmentFile,kind,version'||value.version!==1||!['live','demo'].includes(value.kind)||value.environmentFile!==(value.kind==='live'?'.env.live':'.env'))throw invalid();
  return Object.freeze({version:1,kind:value.kind,environmentFile:value.environmentFile});
 }catch{throw invalid();}
}
/** Explicit selection wins. Production without one uses only preloaded process settings. */
export function resolveRuntimeEnvironmentFile(env=process.env,root=process.cwd()){
 const selected=env.OOTLA_ENV_FILE?.trim();
 if(selected)return{path:path.resolve(root,selected),required:true,kind:null,source:'explicit'};
 if(env.NODE_ENV==='production')return{path:null,required:false,kind:null,source:'preloaded'};
 const instance=readInstanceDefaults(root);
 if(instance)return{path:path.resolve(root,instance.environmentFile),required:true,kind:instance.kind,source:'instance'};
 return{path:path.resolve(root,'.env'),required:false,kind:null,source:'legacy'};
}
