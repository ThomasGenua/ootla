/** Keep implicit form labels stable when a select or textarea contains option/value text. */
export function nameFormControls(root:ParentNode):void{
 for(const label of root.querySelectorAll<HTMLLabelElement>('label')){
  const control=label.querySelector<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea');
  if(!control||control.hasAttribute('aria-label'))continue;
  const title=[...label.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent??'').join(' ').replace(/\s+/g,' ').trim();
  if(title)control.setAttribute('aria-label',title);
 }
}
