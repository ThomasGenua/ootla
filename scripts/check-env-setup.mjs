import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFile,mkdtemp,mkdir,readFile,stat,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
const run=promisify(execFile),source=fileURLToPath(new URL('./setup-env.mjs',import.meta.url)),temporary=await mkdtemp(path.join(tmpdir(),'ootla-env-setup-')),scripts=path.join(temporary,'scripts'),script=path.join(scripts,'setup-env.mjs'),environment=path.join(temporary,'.env');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 await mkdir(scripts);await mkdir(path.join(temporary,'server/config'),{recursive:true});await copyFile(fileURLToPath(new URL('../server/config/instance-files.js',import.meta.url)),path.join(temporary,'server/config/instance-files.js'));await copyFile(source,script);
 const first=await run(process.execPath,[script],{cwd:temporary,windowsHide:true,timeout:10000});
 const bytes=await readFile(environment),text=bytes.toString('utf8'),values=Object.fromEntries(text.trim().split('\n').map(line=>{const index=line.indexOf('=');return[line.slice(0,index),line.slice(index+1)];}));
 assert.equal(values.APP_URL,'http://127.0.0.1:7673');assert.equal(values.DEMO_MODE,'true');assert.equal(values.INTEGRATIONS_MODE,'simulation');assert.equal(values.OUTBOUND_MODE,'simulation');assert.equal(values.NODE_ENV,'development');
 const database=new URL(values.DATABASE_URL);assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'55439');assert.equal(database.pathname,'/ootla_demo');assert(/^[a-f0-9]{48}$/.test(database.password));assert(/^[a-f0-9]{96}$/.test(values.SESSION_SECRET));assert(!first.stdout.includes(database.password)&&!first.stdout.includes(values.SESSION_SECRET));assert(!Object.keys(values).some(name=>name.startsWith('VITE_')));
 console.log('PASS fresh owned environment uses 7673, isolated local demo and random server-only secrets without printing values.');
 const before=await stat(environment),second=await run(process.execPath,[script],{cwd:temporary,windowsHide:true,timeout:10000});assert.equal(hash(await readFile(environment)),hash(bytes));assert.equal((await stat(environment)).mtimeMs,before.mtimeMs);assert.match(second.stdout,/preserved without changes/);assert(!second.stdout.includes(database.password)&&!second.stdout.includes(values.SESSION_SECRET));console.log('PASS repeated setup preserves the existing environment bytes and modification time.');
} catch {console.error('Environment setup check failed; configuration values intentionally omitted.');process.exitCode=1;} finally {await unlink(path.join(temporary,'server/config/instance-files.js')).catch(()=>undefined);await rmdir(path.join(temporary,'server/config')).catch(()=>undefined);await rmdir(path.join(temporary,'server')).catch(()=>undefined);await unlink(environment).catch(()=>undefined);await unlink(script).catch(()=>undefined);await rmdir(scripts).catch(()=>undefined);await rmdir(temporary).catch(()=>undefined);}
