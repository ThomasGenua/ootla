import type {AnalyticsKind,AnalyticsRemoteReport} from '../../shared/google-analytics-contracts.js';
/** Fixed synthetic website activity only. Never derived from applications, residents or CRM outcomes. */
export class IllustrativeAnalyticsAdapter{
 report(kind:AnalyticsKind,range:{from:string;to:string},page:number,pageSize:number):AnalyticsRemoteReport{
  const days=Math.round((Date.parse(range.to+'T00:00:00Z')-Date.parse(range.from+'T00:00:00Z'))/86400000)+1;
  const users=days*19,sessions=days*26,events=days*74,keyEvents=days*3;
  const rows=kind==='summary'?[{label:'Total',users,sessions,events,keyEvents}]:kind==='acquisition'?[
   {label:'google / organic',users:days*9,sessions:days*12,events:null,keyEvents:null},
   {label:'(direct) / (none)',users:days*6,sessions:days*8,events:null,keyEvents:null},
   {label:'referral / partner',users:days*4,sessions:days*6,events:null,keyEvents:null}
  ]:kind==='landing'?[
   {label:'/',users:days*10,sessions:days*13,events:null,keyEvents:null},
   {label:'/workflows/leasing',users:days*6,sessions:days*8,events:null,keyEvents:null},
   {label:'/ai-workflows',users:days*3,sessions:days*5,events:null,keyEvents:null}
  ]:[
   {label:'page_view',users:null,sessions:null,events:days*52,keyEvents:0},
   {label:'demo_explored',users:null,sessions:null,events:days*19,keyEvents:0},
   {label:'contact_clicked',users:null,sessions:null,events:days*3,keyEvents:days*3}
  ];
  return{rows:rows.slice((page-1)*pageSize,page*pageSize),total:rows.length,timeZone:'Africa/Lagos',metadata:{thresholded:false,otherRow:false},available:true};
 }
}
