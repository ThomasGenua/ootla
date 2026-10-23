import {seoHead,isPublicPage,type PublicSiteSettings} from '../../shared/public-site';
/** Only explicit build metadata is public; never read server environment in the browser. */
const settings:PublicSiteSettings={
 origin:document.querySelector<HTMLMetaElement>('meta[name="ootla:site-origin"]')?.content||null,
 indexing:document.querySelector<HTMLMetaElement>('meta[name="ootla:indexing"]')?.content==='true',
};
export function applyRouteSeo(path:string):void {
 const previousTitle=document.title;
 const template=document.createElement('template');
 template.innerHTML=seoHead(path,settings);
 document.head.querySelectorAll('[data-ootla-seo]').forEach(tag=>tag.remove());
 document.head.append(template.content);
 if(!isPublicPage(path))document.title=previousTitle;
}
