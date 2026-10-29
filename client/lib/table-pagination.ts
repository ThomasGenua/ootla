import {escapeHtml as e} from './ui.js';
export interface PageSizeOptions { path: string; pageSize: number; pageKey?: string; sizeKey?: string; max?: number; label?: string; }
// Native GET keeps pagination usable without extra client state or an unbounded browser download.
export function pageSizeControl(query: URLSearchParams, options: PageSizeOptions): string {
  const {path,pageSize,pageKey='page',sizeKey='pageSize',max=50,label='Rows per page'}=options;
  const sizes=[...new Set([10,25,50,...(max>=100?[100]:[]),pageSize])].filter(size=>size>0&&size<=max).sort((a,b)=>a-b);
  const id='rows-per-page-'+pageKey;
  const retained=[...query].filter(([key])=>![pageKey,sizeKey,'saved'].includes(key)).map(([key,value])=>'<input type="hidden" name="'+e(key)+'" value="'+e(value)+'"/>').join('');
  return '<form method="get" action="'+e(path)+'" class="table-page-size" data-page-size-control>'+retained+'<input type="hidden" name="'+e(pageKey)+'" value="1"/><label for="'+e(id)+'">'+e(label)+'</label><select id="'+e(id)+'" name="'+e(sizeKey)+'">'+sizes.map(size=>'<option value="'+size+'" '+(size===pageSize?'selected':'')+'>'+size+'</option>').join('')+'</select><button type="submit" class="cv-button">Apply</button></form>';
}

export interface TablePaginationOptions {path:string;pageKey?:string;sizeKey?:string;max?:number;label?:string;ariaLabel?:string}
export function tablePagination<T>(data:{items?:T[];total:number;page:number;pageSize:number;totalPages:number},query:URLSearchParams,options:TablePaginationOptions):string{
 const {path,pageKey='page',sizeKey='pageSize',max=50,label='Rows per page',ariaLabel='Results pagination'}=options;
 const at=(page:number,title:string)=>{const next=new URLSearchParams(query);next.delete('saved');next.set(pageKey,String(page));return '<a href="'+e(path+'?'+next)+'" data-link class="cv-button">'+title+'</a>';};
 const start=data.total&&data.page<=data.totalPages?(data.page-1)*data.pageSize+1:0,end=start?Math.min(data.total,data.page*data.pageSize):0;
 return '<div class="table-pagination" data-table-pagination id="table-pagination-'+e(pageKey)+'" tabindex="-1">'+pageSizeControl(query,{path,pageSize:data.pageSize,pageKey,sizeKey,max,label})+'<nav class="table-pagination-nav" aria-label="'+e(ariaLabel)+'"><span class="table-pagination-count">'+start.toLocaleString()+'–'+end.toLocaleString()+' of '+data.total.toLocaleString()+'</span><div class="table-pagination-links">'+(data.page>1?at(data.page-1,'Previous'):'<span aria-disabled="true">Previous</span>')+'<span>Page '+data.page+' of '+Math.max(1,data.totalPages)+'</span>'+(data.page<data.totalPages?at(data.page+1,'Next'):'<span aria-disabled="true">Next</span>')+'</div></nav></div>';
}
