import type { ConnectorAdapter } from './adapter.js';
import { yardiDemoAdapter } from './yardi-demo.js';
// Registration is deliberate server code. Browser provider names, URLs or state
// values cannot load an adapter or activate a live integration.
const registeredAdapters:ReadonlyMap<string,ConnectorAdapter>=new Map([[yardiDemoAdapter.key,yardiDemoAdapter]]);
export function getConnectorAdapter(key:string):ConnectorAdapter|null{return registeredAdapters.get(key)??null;}
