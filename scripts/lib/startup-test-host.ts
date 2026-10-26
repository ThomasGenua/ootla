// Exercise only the real entrypoint in an owned loopback fixture, with external HTTP blocked.
import {installLocalFixtureNetworkGuard} from './local-network-guard.js';
const connection=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL):null;
if(process.env.OOTLA_STARTUP_CHECK!=='true'||process.env.OOTLA_BIND_HOST!=='127.0.0.1'||connection&&(connection.hostname!=='127.0.0.1'||connection.port!=='55439'||!/^\/ootla_demo_chat_api_[a-f0-9]{32}$/.test(connection.pathname)))throw Error('Only an owned isolated startup fixture may run this host.');
installLocalFixtureNetworkGuard();
process.on('message',value=>{if(value==='stop-owned-ootla-startup-check'){process.disconnect?.();process.emit('SIGTERM');}});
process.channel?.unref();
await import('../../server/index.js');
