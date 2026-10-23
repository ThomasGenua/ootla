/** Credits are revealed by hover, keyboard focus or touch, without taking layout space. */
export function initializePhotoCredits(signal:AbortSignal):void {
 const photos=[...document.querySelectorAll<HTMLElement>('.public-photo[data-photo-credit]')];
 const reset=(photo:HTMLElement)=>{if(!photo.matches(':hover,:focus-within'))delete photo.dataset.creditDismissed;};
 for(const photo of photos){
  photo.addEventListener('pointerleave',()=>reset(photo),{signal});
  photo.addEventListener('focusout',()=>queueMicrotask(()=>reset(photo)),{signal});
  photo.addEventListener('pointerup',event=>{
   if(event.pointerType==='touch'&&!(event.target instanceof Element&&event.target.closest('a')))photo.focus({preventScroll:true});
  },{signal});
 }
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  for(const photo of photos){
   if(!photo.matches(':hover,:focus-within'))continue;
   if(photo.querySelector('figcaption')?.contains(document.activeElement))photo.focus({preventScroll:true});
   photo.dataset.creditDismissed='true';
  }
 },{signal});
}
