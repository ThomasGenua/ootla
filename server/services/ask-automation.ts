import type {AskOotlaCapability} from './ask-ootla.js';
import {Automations} from './automations.js';
/** Fixed, permission-checked facts from the same service as the rules workspace. */
export const automationAskCapability:AskOotlaCapability={
 name:'automation_reminders',
 matches:message=>!/\b(?:create|add|save|make)\b/i.test(message)&&/\b(?:automation|automated|reminders?|why.*(?:task|follow.?up))\b/i.test(message),
 async run({database,config,actor,sessionDigest,context}){
  const result=await new Automations(database,config).insights(actor,sessionDigest,context.propertyId),now=new Date().toISOString();
  return{status:'completed',mode:'simulated',body:(result.paused?'Organization automation is paused. ':'')+(result.total?result.total+' outstanding automation item'+(result.total===1?'':'s')+' in this authorized scope. '+result.items.map(v=>v.title+' — '+v.reason+' Due '+v.dueAt+'; '+v.status+'.').join(' '):'No outstanding automation reminders match this authorized scope. ')+result.notice,
   sources:result.items.map(v=>({id:'automation:'+v.id,kind:'task',title:v.title,url:v.url,excerpt:v.reason+' Due '+v.dueAt,verifiedAt:now,simulated:config.demoMode}))};
 }
};
