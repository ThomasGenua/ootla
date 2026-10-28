export type OotlaInstanceDefaults = Readonly<{version:1;kind:'live';environmentFile:'.env.live'}|{version:1;kind:'demo';environmentFile:'.env'}>;
export type RuntimeEnvironmentSelection =
 | {path:string;required:true;kind:null;source:'explicit'}
 | {path:null;required:false;kind:null;source:'preloaded'}
 | {path:string;required:true;kind:'live'|'demo';source:'instance'}
 | {path:string;required:false;kind:null;source:'legacy'};
/** Pure branch-default validation; does not load private values. */
export declare function readInstanceDefaults(root?:string):OotlaInstanceDefaults|null;
/** Explicit file selection wins; production without one remains preloaded-only. */
export declare function resolveRuntimeEnvironmentFile(env?:Record<string,string|undefined>,root?:string):RuntimeEnvironmentSelection;
