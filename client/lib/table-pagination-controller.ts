/** Align existing shared controls with their existing pager without replacing module queries/actions. */
export function initializeTablePagination(signal:AbortSignal,navigate:(path:string,replace?:boolean,focusSelector?:string)=>void):void{
 const forms=[...document.querySelectorAll<HTMLFormElement>('form[data-page-size-control]')];
 for(const form of forms){
  let row=form.closest<HTMLElement>('[data-table-pagination]');
  if(!row){
   const previous=form.previousElementSibling;
   const pager=previous?.matches('nav[aria-label*="pag"],nav[aria-label*="pages"],[class*="-pager"],[class*="-pagination"]')?previous as HTMLElement:null;
   if(pager){row=document.createElement('div');row.className='table-pagination';row.dataset.tablePagination='';pager.before(row);row.append(form,pager);}
  }
  if(!row){row=document.createElement('div');row.className='table-pagination';row.dataset.tablePagination='';form.before(row);row.append(form);}
  if(!row.id){const select=form.querySelector<HTMLSelectElement>('select');row.id='table-pagination-'+(select?.id.replace(/^rows-per-page-/,'')??String(forms.indexOf(form)));}
  row.tabIndex=-1;
  form.addEventListener('submit',event=>{
   if(event.defaultPrevented||!form.reportValidity())return;const target=new URL(form.action,location.origin);if(target.origin!==location.origin||target.pathname!==location.pathname)return;
   event.preventDefault();event.stopPropagation();target.search=new URLSearchParams([...new FormData(form)].map(([key,value])=>[key,String(value)])).toString();navigate(target.pathname+target.search,false,'#'+row!.id);
  },{signal});
 }
 for(const row of document.querySelectorAll<HTMLElement>('[data-table-pagination]'))row.addEventListener('click',event=>{
  const anchor=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[data-link]'):null;
  if(!anchor||event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;
  const target=new URL(anchor.href,location.origin);if(target.origin!==location.origin||target.pathname!==location.pathname)return;
  event.preventDefault();event.stopPropagation();navigate(target.pathname+target.search+target.hash,false,'#'+row.id);
 },{signal});
}
