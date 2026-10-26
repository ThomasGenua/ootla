/** Keep native modal dialogs keyboard-contained, including Chromium's body focus sentinel. */
export function containDialogFocus(dialog:HTMLDialogElement,signal:AbortSignal):void{
 dialog.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();return;}
  if(event.key!=='Tab')return;
  const controls=[...dialog.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')].filter(node=>!node.hasAttribute('disabled')&&node.getAttribute('aria-hidden')!=='true'&&node.getClientRects().length>0&&node.tabIndex>=0);
  if(!controls.length){event.preventDefault();dialog.focus();return;}
  const first=controls[0]!,last=controls.at(-1)!,active=document.activeElement,tracked=active instanceof HTMLElement&&controls.includes(active);
  if(event.shiftKey&&(active===first||!tracked)){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(active===last||!tracked)){event.preventDefault();first.focus();}
 },{signal});
}
