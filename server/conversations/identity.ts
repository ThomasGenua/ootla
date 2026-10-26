import {createHash} from 'node:crypto';
export function conversationRequestId(scope:string,key:string):string{const v=createHash('sha256').update(scope+':'+key).digest('hex');return v.slice(0,8)+'-'+v.slice(8,12)+'-4'+v.slice(13,16)+'-8'+v.slice(17,20)+'-'+v.slice(20,32);}
