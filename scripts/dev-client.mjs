import '../server/config/environment.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// The browser origin must match the backend's existing strict Origin protection.
// Keep development loopback-only and fail if the configured port is occupied.
const root=fileURLToPath(new URL('..',import.meta.url));
let server;
try {
 const origin=new URL(process.env.APP_URL || 'http://127.0.0.1:5173');
 if(process.env.NODE_ENV==='production'||origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash) throw new Error('Invalid development origin');
 const host=origin.hostname==='[::1]'?'::1':origin.hostname;
 const port=origin.port ? Number(origin.port) : 80;
 server=await createServer({configFile:path.join(root,'vite.config.ts'),server:{host,port,strictPort:true}});
 let closing=false;
 const close=async()=>{if(closing)return;closing=true;await server.close();};
 process.once('SIGINT',()=>{void close();});
 process.once('SIGTERM',()=>{void close();});
 await server.listen();
 console.info('Ootla development preview: '+origin.origin);
 server.printUrls();
} catch {
 await server?.close();
 console.error('Ootla frontend could not start. APP_URL must be a loopback HTTP origin with an available port; production uses the compiled server.');
 process.exitCode=1;
}
