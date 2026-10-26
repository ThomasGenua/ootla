/** Test-only guard. Only origins registered by an owned fixture may perform HTTP I/O. */
export function installLocalFixtureNetworkGuard(){
 const original=globalThis.fetch,origins=new Set<string>();
 globalThis.fetch=async(input,init)=>{
  const target=new URL(input instanceof Request?input.url:String(input));
  if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||target.username||target.password||!origins.has(target.origin))throw new Error('Unexpected network request prevented by the isolated fixture.');
  return original(input,{...init,redirect:init?.redirect??'manual'});
 };
 return{allow:(origin:string)=>{const target=new URL(origin);if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||!target.port||['3100','5173','7673'].includes(target.port)||target.username||target.password)throw new Error('Refusing a non-fixture origin.');origins.add(target.origin);},restore:()=>{globalThis.fetch=original;}};
}
