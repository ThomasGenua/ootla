import type {Express} from 'express';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {isIsolatedDemo} from '../services/demo-environment.js';
/** Presentation follows verified runtime isolation; never a browser flag. */
export async function publicDemoAccess(config:ServerConfig,database:Database):Promise<boolean>{
 if(!config.demoMode||config.production)return false;
 try{return await database.state()==='ready'&&await isIsolatedDemo(config,database);}catch{return false;}
}
export function installPublicAccess(app:Express,config:ServerConfig,database:Database):void{
 app.get('/api/public-access',async(_request,response)=>{response.setHeader('Cache-Control','no-store, private');response.setHeader('X-Robots-Tag','noindex, nofollow');response.json({demoAccess:await publicDemoAccess(config,database)});});
}
