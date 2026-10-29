/** Small same-page DOM updates. Nodes, dirty editors and real scrolling containers stay mounted. */
export interface LocalUpdateOptions {committedForm?:HTMLFormElement|null;preserveEditors?:boolean}
const navigationForm=(form:HTMLFormElement)=>[...form.attributes].some(a=>/filter|search|options|page-size|sort/.test(a.name));
function key(node:Node):string{
 if(!(node instanceof Element))return '';
 if(node.id)return node.tagName+'#'+node.id;
 if(node.matches('input,select,textarea,button')&&node.getAttribute('name'))return node.tagName+':'+node.getAttribute('name')+':'+(node.getAttribute('type')??'');
 const hooks=[...node.attributes].filter(a=>a.name.startsWith('data-')&&!/version|request|payload|loaded|busy|state|saved/.test(a.name)).map(a=>a.name+'='+a.value);
 if(hooks.length)return node.tagName+':'+hooks.join('|');
 const heading=node.firstElementChild;
 if(heading?.matches('h2,h3,summary'))return node.tagName+':'+heading.tagName+':'+heading.textContent?.replace(/\s+/g,' ').trim();
 return '';
}
function compatible(a:Node,b:Node):boolean{return a.nodeType===b.nodeType&&(!(a instanceof Element)||b instanceof Element&&a.tagName===b.tagName)&&(!key(a)&&!key(b)||key(a)===key(b));}
export function patchLocalElement(target:Element,fresh:Element,options:LocalUpdateOptions={}):void{
 if(target.isEqualNode(fresh)&&!target.matches('input,select,textarea')&&!target.querySelector('input,select,textarea'))return;
 const control=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement?target:null;
 const form=control?.form,editor=options.preserveEditors!==false&&form&&!navigationForm(form)&&form!==options.committedForm;
 const dirty=control instanceof HTMLSelectElement?[...control.options].some(option=>option.selected!==option.defaultSelected):control instanceof HTMLInputElement&&['checkbox','radio'].includes(control.type)?control.checked!==control.defaultChecked:control?control.value!==control.defaultValue:false;
 const preserve=Boolean(editor&&dirty),value=control?.value,checked=control instanceof HTMLInputElement?control.checked:false;
 const selected=control instanceof HTMLSelectElement?[...control.selectedOptions].map(option=>({value:option.value,label:option.textContent??''})):[];
 const open=target instanceof HTMLDetailsElement||target instanceof HTMLDialogElement?target.open:null;
 for(const attr of [...target.attributes])if(!fresh.hasAttribute(attr.name)&&attr.name!=='open'&&!/^data-(request-key|request-input|payload)$/.test(attr.name))target.removeAttribute(attr.name);
 for(const attr of [...fresh.attributes])if(attr.name!=='open'&&target.getAttribute(attr.name)!==attr.value)target.setAttribute(attr.name,attr.value);
 if(!(target instanceof HTMLInputElement)&&!(target instanceof HTMLTextAreaElement)){
  let cursor=target.firstChild;
  for(const desired of [...fresh.childNodes]){
   let match:Node|null=cursor;
   if(!match||!compatible(match,desired)){match=null;for(let candidate=cursor;candidate;candidate=candidate.nextSibling)if(compatible(candidate,desired)){match=candidate;break;}}
   if(!match){match=desired.cloneNode(true);target.insertBefore(match,cursor);}
   else{if(match!==cursor)target.insertBefore(match,cursor);if(match instanceof Element&&desired instanceof Element)patchLocalElement(match,desired,options);else if(match.nodeValue!==desired.nodeValue)match.nodeValue=desired.nodeValue;}
   cursor=match.nextSibling;
  }
  while(cursor){const next=cursor.nextSibling;target.removeChild(cursor);cursor=next;}
 }
 if(target instanceof HTMLInputElement&&fresh instanceof HTMLInputElement){
  target.defaultValue=fresh.defaultValue;target.defaultChecked=fresh.defaultChecked;
  if(target.type!=='file'&&target.value!==(preserve?value:fresh.value))target.value=preserve?value??'':fresh.value;
  if(['checkbox','radio'].includes(target.type))target.checked=preserve?checked:fresh.checked;
 }else if(target instanceof HTMLTextAreaElement&&fresh instanceof HTMLTextAreaElement){target.defaultValue=fresh.defaultValue;if(target.value!==(preserve?value:fresh.value))target.value=preserve?value??'':fresh.value;}
 else if(target instanceof HTMLSelectElement&&fresh instanceof HTMLSelectElement){
  if(preserve){for(const item of selected)if(![...target.options].some(option=>option.value===item.value))target.append(new Option(item.label,item.value));for(const option of target.options)option.selected=selected.some(item=>item.value===option.value);}
  else{const choices=new Set([...fresh.selectedOptions].map(option=>option.value));for(const option of target.options)option.selected=choices.has(option.value);}
 }
 if(open!==null&&(target instanceof HTMLDetailsElement||target instanceof HTMLDialogElement)&&target.open!==open)target.open=open;
}
/** Capture only affected/local scroll containers, then compensate once if layout actually displaced them. */
export function captureLocalScroll(scope:Element):()=>void{
 const scrolling=document.scrollingElement as HTMLElement|null,containers=new Set<HTMLElement>();
 for(let element:Element|null=scope;element;element=element.parentElement)if(element instanceof HTMLElement&&/(auto|scroll)/.test(getComputedStyle(element).overflowY))containers.add(element);
 for(const element of scope.querySelectorAll<HTMLElement>('*'))if(element.scrollHeight>element.clientHeight+1&&/(auto|scroll)/.test(getComputedStyle(element).overflowY))containers.add(element);
 const positions=[...containers].map(element=>({element,top:element.scrollTop,left:element.scrollLeft}));
 const top=scrolling?.scrollTop??0,left=scrolling?.scrollLeft??0;
 return()=>{for(const item of positions)if(item.element.isConnected){const next=Math.min(item.top,Math.max(0,item.element.scrollHeight-item.element.clientHeight));if(Math.abs(item.element.scrollTop-next)>1)item.element.scrollTop=next;if(item.element.scrollLeft!==item.left)item.element.scrollLeft=item.left;}
  if(scrolling){const next=Math.min(top,Math.max(0,scrolling.scrollHeight-scrolling.clientHeight));if(Math.abs(scrolling.scrollTop-next)>1)scrolling.scrollTop=next;if(scrolling.scrollLeft!==left)scrolling.scrollLeft=left;}
 };
}
export function patchLocalHtml(target:Element,html:string,options:LocalUpdateOptions={}):void{const template=document.createElement('template');template.innerHTML=html;const fresh=target.cloneNode(false)as Element;fresh.append(template.content);patchLocalElement(target,fresh,options);}
export function updateSummaryFromShell(html:string):void{const template=document.createElement('template');template.innerHTML=html;for(const selector of ['.summary-metrics','.header-summary-context','.header-summary-period-note']){const current=document.querySelector(selector),fresh=template.content.querySelector(selector);if(current&&fresh)patchLocalElement(current,fresh,{preserveEditors:false});}}
