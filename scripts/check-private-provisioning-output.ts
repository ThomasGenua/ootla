import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,mkdir,stat,chmod,realpath,rm} from 'node:fs/promises';
import {preparePrivateOutput,savePrivateOutput} from './lib/private-provisioning-output.js';
const root=await realpath(process.cwd()),temporaryRoot=await realpath(os.tmpdir()),directory=await mkdtemp(path.join(temporaryRoot,'ootla-private-output-'));
const requestKey=randomUUID(),hash=createHash('sha256').update('synthetic-manifest-runtime').digest('hex');let groups=0;
try{
 const target=path.join(directory,'invitation.json'),plan=await preparePrivateOutput(target,root,requestKey,hash),token='a'.repeat(64),result={invitation:{url:'https://customer.example.test/staff/invite#token='+token,state:'pending'}};
 const raced=await Promise.allSettled([savePrivateOutput(plan,result),savePrivateOutput(plan,result)]);assert.equal(raced.filter(v=>v.status==='fulfilled').length,1);assert.equal(raced.filter(v=>v.status==='rejected').length,1);
 const bytes=await readFile(target),parsed=JSON.parse(bytes.toString());assert.equal(parsed.requestKey,requestKey);assert.equal(parsed.manifestHash,hash);assert.equal(parsed.invitation.url,result.invitation.url);if(process.platform!=='win32')assert.equal((await stat(target)).mode&0o077,0);groups++;console.log('PASS one exclusive private invitation output wins competing writes; token stays only in its intended private fragment artifact.');
 const again=await preparePrivateOutput(target,root,requestKey,hash);assert.equal(await savePrivateOutput(again,{invitation:{url:null}}),false);assert.deepEqual(await readFile(target),bytes);
 await assert.rejects(preparePrivateOutput(target,root,randomUUID(),hash));await assert.rejects(preparePrivateOutput(target,root,requestKey,'b'.repeat(64)));assert.deepEqual(await readFile(target),bytes);groups++;console.log('PASS identical retries preserve existing bytes; changed requests or runtimes cannot overwrite the old output.');
 await assert.rejects(preparePrivateOutput(path.join(root,'.local','forbidden-invitation.json'),root,requestKey,hash));await assert.rejects(preparePrivateOutput('relative-invitation.json',root,requestKey,hash));const collision=path.join(directory,'unrelated.json');await writeFile(collision,'unrelated private file',{mode:0o600});await assert.rejects(preparePrivateOutput(collision,root,requestKey,hash));assert.equal(await readFile(collision,'utf8'),'unrelated private file');const asDirectory=path.join(directory,'directory.json');await mkdir(asDirectory);await assert.rejects(preparePrivateOutput(asDirectory,root,requestKey,hash));groups++;console.log('PASS relative/checkout/static output, unrelated files and directory collisions are refused without replacement.');
 if(process.platform!=='win32'){const unsafe=path.join(directory,'unsafe');await mkdir(unsafe,{mode:0o700});await chmod(unsafe,0o777);try{await assert.rejects(preparePrivateOutput(path.join(unsafe,'invite.json'),root,requestKey,hash));}finally{await chmod(unsafe,0o700);}groups++;console.log('PASS group/other-writable output parents are refused.');}
 console.log('Private provisioning output passed '+groups+' focused groups; no database or network; POSIX mode enforcement '+(process.platform==='win32'?'awaits Linux/ACL verification.':'verified.'));
}finally{const resolved=await realpath(directory);assert.equal(path.dirname(resolved),temporaryRoot);assert(path.basename(resolved).startsWith('ootla-private-output-'));await rm(resolved,{recursive:true,force:true});}
