import type {Browser,Page,APIResponse} from '@playwright/test';
import type {ConversationFixture} from './conversation-fixture.js';
import type {seedResidentDemo} from '../../server/services/resident-demo.js';
export interface FinalAcceptanceContext{
 fixture:ConversationFixture;base:string;browser:Browser;
 pages:{originalAdmin:Page;staff:Page;applicant:Page;residentStaff:Page;resident:Page;standalone:Page};
 resident:Awaited<ReturnType<typeof seedResidentDemo>>;
 records:Record<string,string>;
 url(path:string):string;
 raw(page:Page,path:string,method?:string,body?:unknown,headers?:Record<string,string>):Promise<APIResponse>;
 json<T=any>(page:Page,path:string,method?:string,body?:unknown,status?:number|number[]):Promise<T>;
 loginStaff(page:Page,email:string,password:string):Promise<void>;
 loginApplicant(page:Page,email:string,password:string):Promise<void>;
 shot(page:Page,name:string):Promise<void>;
 phase(label:string):void;pass(label:string):void;
}
