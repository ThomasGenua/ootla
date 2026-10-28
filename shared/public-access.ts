/** Public presentation only. Authentication and demo isolation remain server-side. */
export interface PublicAccessPresentation { demoAccess: boolean }
type Region = 'cta' | 'secondary-sign-in' | 'hero-note';
const region = (name:Region, html:string):string => '<!--ootla-public-access:'+name+':start-->'+html+'<!--ootla-public-access:'+name+':end-->';
export function publicAccessCta(className:string, suffix=''):string {
 return region('cta','<a href="/admin/login" data-link class="'+className+'"><span data-public-access-label>Sign in</span>'+suffix+'</a>');
}
export function publicAccessSecondarySignIn():string { return region('secondary-sign-in',''); }
export function publicAccessHeroNote():string { return region('hero-note','<p>Your connected workspace.<br><span>Sign in to continue your property work.</span></p>'); }
/** Rewrite only explicit Ootla access regions, never customer content or product examples. */
export function rewritePublicAccess(html:string, demoAccess:boolean):string {
 const enabled=demoAccess===true;
 return html.replace(/<!--ootla-public-access:(cta|secondary-sign-in|hero-note):start-->([\s\S]*?)<!--ootla-public-access:\1:end-->/g,(_match,name:Region,content:string)=>{
  if(name==='secondary-sign-in')return region(name,enabled?'<a href="/admin/login" data-link class="public-sign-in">Sign in</a>':'');
  if(name==='hero-note')return region(name,enabled?'<p>Explore demo.<br><span>Interactive preview with sample records.</span></p>':'<p>Your connected workspace.<br><span>Sign in to continue your property work.</span></p>');
  return region(name,content.replace(/href="(?:\/admin\/login|\/try)"/,'href="'+(enabled?'/try':'/admin/login')+'"').replace(/<span data-public-access-label>[^<]*<\/span>/,'<span data-public-access-label>'+(enabled?'Explore demo':'Sign in')+'</span>'));
 });
}
