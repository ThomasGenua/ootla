import path from 'node:path';
import {constants} from 'node:fs';
import {realpath,lstat,readFile,open,unlink} from 'node:fs/promises';
export class PrivateOutputError extends Error{}
export interface PrivateOutputPlan{path:string;requestKey:string;manifestHash:string;existing:Record<string,unknown>|null}
const within=(root:string,target:string)=>{const relative=path.relative(root,target);return relative===''||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
/** Invitation links stay outside the complete checkout/release, including Vite's source filesystem. */
export async function preparePrivateOutput(file:string,projectRoot:string,requestKey:string,manifestHash:string):Promise<PrivateOutputPlan>{
 if(!path.isAbsolute(file))throw new PrivateOutputError('Use an absolute private invitation output path.');
 const root=await realpath(projectRoot),parent=await realpath(path.dirname(file)),target=path.join(parent,path.basename(file));
 if(within(root,target))throw new PrivateOutputError('Invitation output must be outside the application checkout/release and its public files.');
 const directory=await lstat(parent);if(!directory.isDirectory())throw new PrivateOutputError('The private output parent must already exist.');
 if(process.platform!=='win32'&&(directory.mode&0o022)!==0)throw new PrivateOutputError('The private invitation directory cannot be writable by another group or user.');
 let existing:Record<string,unknown>|null=null;
 try{const stat=await lstat(target);if(!stat.isFile()||stat.isSymbolicLink())throw new PrivateOutputError('Existing invitation output must be a private regular file.');if(process.platform!=='win32'&&(stat.mode&0o077)!==0)throw new PrivateOutputError('Existing invitation output requires owner-only permissions.');if(stat.size>65536)throw new PrivateOutputError('Existing invitation output is not an Ootla receipt.');const value=JSON.parse(await readFile(target,'utf8')) as Record<string,unknown>;if(value.format!=='ootla-first-administrator-invitation'||value.version!==1||value.requestKey!==requestKey||value.manifestHash!==manifestHash)throw new PrivateOutputError('This output path belongs to different provisioning instructions. Use a new private file; nothing was overwritten.');existing=value;
 }catch(issue){if((issue as NodeJS.ErrnoException).code!=='ENOENT')throw issue;}
 return{path:target,requestKey,manifestHash,existing};
}
export async function savePrivateOutput(plan:PrivateOutputPlan,result:Record<string,unknown>):Promise<boolean>{
 if(plan.existing)return false;
 const handle=await open(plan.path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);const identity=await handle.stat();
 try{await handle.writeFile(JSON.stringify({...result,format:'ootla-first-administrator-invitation',version:1,requestKey:plan.requestKey,manifestHash:plan.manifestHash},null,2)+'\n','utf8');await handle.sync();}
 catch(issue){await handle.close();const current=await lstat(plan.path).catch(()=>null);if(current&&current.ino===identity.ino&&current.dev===identity.dev)await unlink(plan.path);throw issue;}
 await handle.close();return true;
}
