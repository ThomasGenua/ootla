import {readFileSync}from'node:fs';
import path from'node:path';
import type{Express,Request}from'express';
import type{ServerConfig}from'../config/env.js';
import {isPublicPage,publicPath,publicHtmlAlias,readPublicSiteSettings,robotsText,sitemapXml,type PublicSiteSettings}from'../../shared/public-site.js';
export function runtimePublicSiteSettings(config:ServerConfig,directory:string):PublicSiteSettings {
 try{
  const manifest=JSON.parse(readFileSync(path.join(directory,'public-site-manifest.json'),'utf8')) as {version?:number;origin?:unknown;indexing?:unknown};
  if(manifest.version!==1||typeof manifest.indexing!=='boolean'||(manifest.origin!==null&&typeof manifest.origin!=='string'))return{origin:null,indexing:false};
  const target=readPublicSiteSettings({PUBLIC_SITE_URL:manifest.origin??'',PUBLIC_SITE_INDEXING:String(manifest.indexing)});
  return {...target,indexing:target.indexing&&config.production&&!config.demoMode&&config.appUrl===target.origin};
 }catch{return{origin:null,indexing:false};}
}
export function installPublicSiteHttp(app:Express,config:ServerConfig,directory:string):void {
 const settings=runtimePublicSiteSettings(config,directory);
 const forRequest=(request:Request):PublicSiteSettings=>({...settings,indexing:settings.indexing&&request.get('host')?.toLowerCase()===new URL(settings.origin!).host.toLowerCase()});
 app.use((request,response,next)=>{
  const route=publicPath(request.path),alias=publicHtmlAlias(request.path);
  const privateRoute=/^\/(?:admin|applicant|book|api)(?:\/|$)/.test(route);
  if(privateRoute)response.setHeader('X-Robots-Tag','noindex, nofollow');
  else if(!forRequest(request).indexing)response.setHeader('X-Robots-Tag','noindex, follow');
  if((request.method==='GET'||request.method==='HEAD')&&alias){response.redirect(308,alias);return;}
  if(route==='/app-shell.html'){response.setHeader('X-Robots-Tag','noindex, nofollow');response.status(404).type('text/plain').send('Page or asset not found.');return;}
  if(!isPublicPage(route)&&request.path.endsWith('.html'))response.setHeader('X-Robots-Tag','noindex, nofollow');
  next();
 });
 app.get('/robots.txt',(request,response)=>{response.setHeader('Cache-Control','no-cache');response.type('text/plain').send(robotsText(forRequest(request)));});
 app.get('/sitemap.xml',(request,response)=>{response.setHeader('Cache-Control','no-cache');response.type('application/xml').send(sitemapXml(forRequest(request)));});
}
