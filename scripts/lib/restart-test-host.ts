// Owned test host: exercise the real entrypoint and its SIGTERM handler over private IPC on Windows/Linux.
const url=new URL(process.env.DATABASE_URL??'http://invalid');if(process.env.OOTLA_RESTART_CHECK!=='true'||process.env.NODE_ENV!=='test'||url.hostname!=='127.0.0.1'||url.port!=='55439'||!/^\/ootla_demo_chat_api_[a-f0-9]{32}$/.test(url.pathname))throw Error('Only an owned isolated restart fixture may run this host.');
process.on('message',value=>{if(value==='stop-owned-ootla-restart-check'){process.disconnect?.();process.emit('SIGTERM');}});
if(process.env.OOTLA_RESTART_COMPILED==='true')await import(new URL('../../dist/server/server/index.js',import.meta.url).href);else await import('../../server/index.js');
