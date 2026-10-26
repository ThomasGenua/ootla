import type {AskOotlaCapability} from './ask-ootla.js';
import {portfolioQuerySchema,type PortfolioView} from '../../shared/reporting-contracts.js';
import {PortfolioReportingService} from './portfolio-reporting.js';
const reportUrl=(q:Record<string,unknown>)=>'/admin/reports?'+new URLSearchParams(Object.entries(q).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)] as [string,string]));
export const portfolioAskCapability:AskOotlaCapability={
 name:'portfolio_reporting',
 matches:message=>!/\b(?:create|add|save|make)\b/i.test(message)&&/\b(?:portfolio|report|conversion|performance|perform(?:ed)?|pipeline|workload|slowing|applications? (?:are )?waiting|applications?.*documents|leads?.*follow.?up)\b/i.test(message),
 async run({database,config,actor,sessionDigest,context,message}){
  const to=new Date().toISOString().slice(0,10),from=new Date(Date.now()-29*86400000).toISOString().slice(0,10);
  let view:PortfolioView='properties',attention:'all'|'missing_documents'|'follow_up_due'|'staff_review'='all',oldest=false;
  if(/\b(?:documents?|checklist|missing)\b/i.test(message)){view='applications';attention='missing_documents';}
  else if(/\b(?:slowing|staff review|applications?)\b/i.test(message)){view='applications';oldest=true;if(/staff review/i.test(message))attention='staff_review';}
  else if(/\b(?:leads?|follow.?ups?)\b/i.test(message)){view='follow_ups';attention='follow_up_due';}
  else if(/\b(?:workload|team|staff)\b/i.test(message))view='workload';
  else if(/\b(?:pipeline|age)\b/i.test(message)){view='pipeline';oldest=true;}
  const selected=context.report,dates=message.match(/\d{4}-\d{2}-\d{2}/g);
  const query=portfolioQuerySchema.parse({...selected,from:dates?.length===2?dates[0]:selected?.from??from,to:dates?.length===2?dates[1]:selected?.to??to,propertyId:context.propertyId,view,attention:attention==='all'?selected?.attention??'all':attention,sort:oldest?'age_desc':'name_asc',page:1,pageSize:10});
  const result=await new PortfolioReportingService(database,config).explain(actor,sessionDigest,query),url=reportUrl(query);
  const counts=result.periodCounts,rows=result.table.items;
  const facts='Period counts: '+counts.leadsCreated+' leads created, '+counts.viewingsBooked+' viewings booked, '+counts.applicationsSubmitted+' actual portal submissions, '+counts.leasesVerified+' leases with valid verified milestones. These period totals are not divided into conversion rates.';
  const cohorts=result.cohorts.map(v=>v.label+': '+v.numerator+'/'+v.denominator+(v.ratePercent===null?' (no defined rate)':(' ('+v.ratePercent+'%)'))).join('; ');
  const table=rows.length?rows.map(v=>v.label+': '+result.table.columns.map(col=>col.label+' '+(v.values[col.key]===null||v.values[col.key]===undefined?'unavailable':String(v.values[col.key]))).join(', ')).join('; '):'No matching rows are recorded in this authorized report scope.';
  const body='Observed '+result.observedAt+'. Selected dates '+result.range.from+' to '+result.range.to+' (UTC); cohort outcomes stop at '+result.range.cohortCutoff+'. '+facts+' Linked cohorts: '+cohorts+'. '+result.table.title+': '+result.table.total+' matching rows; showing up to10. '+table+'. Current owners/statuses are observed now. Missing-document counts disclose no document contents. These are observed facts, not a causal explanation. Review the linked records before deciding what to change.';
  return{status:'completed',mode:'simulated',body,sources:[{id:'portfolio:'+view,title:'Portfolio report and metric definitions',kind:'report',url,excerpt:'Same authorized query and definitions as the native report. UTC '+result.range.from+' to '+result.range.to+'. '+result.notice,verifiedAt:result.observedAt,simulated:config.demoMode},...rows.slice(0,8).map(v=>({id:'portfolio-row:'+view+':'+v.id,kind:'report',title:v.label,url:v.url??url,excerpt:result.table.columns.slice(0,4).map(c=>c.label+': '+(v.values[c.key]??'unavailable')).join('; '),verifiedAt:result.observedAt,simulated:config.demoMode}))]};
 }
};
