/** Stage25: internal normalized interfaces, not a fabricated commercial provider API. */
export type VoiceSpeechInput={kind:'transcript'|'silence'|'unclear'|'interruption'|'timeout'|'provider_failure';text?:string};
export type VoiceRecognition={status:'recognized'|'no_input'|'unclear'|'interrupted'|'timed_out'|'unavailable';text:string|null;mode:'transcript_playback'|'not_configured'};
export interface VoiceSpeechRecognition{readonly key:string;recognize(input:VoiceSpeechInput):Promise<VoiceRecognition>}
export interface VoiceSpeechOutput{readonly key:string;speak(text:string):Promise<{mode:'text_playback'|'not_configured';text:string|null;audioCreated:false}>}
export interface VoiceStaffTransfer{request():Promise<{state:'not_configured';confirmed:false;reason:string}>}
export interface VoiceDialogue<TContext,TResult>{respond(context:TContext):Promise<TResult>}
export interface VoicePermittedTools<TInput,TResult>{execute(input:TInput):Promise<TResult>}
export const transcriptPlaybackRecognition:VoiceSpeechRecognition={
 key:'local_transcript_playback',
 async recognize(input){
  const states={silence:'no_input',unclear:'unclear',interruption:'interrupted',timeout:'timed_out',provider_failure:'unavailable'} as const;
  if(input.kind!=='transcript')return{status:states[input.kind],text:null,mode:input.kind==='provider_failure'?'not_configured':'transcript_playback'};
  const text=(input.text??'').trim();if(!text)return{status:'no_input',text:null,mode:'transcript_playback'};
  if(text.length>1500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))return{status:'unclear',text:null,mode:'transcript_playback'};
  return{status:'recognized',text,mode:'transcript_playback'};
 }
};
export const transcriptPlaybackOutput:VoiceSpeechOutput={key:'local_text_playback',async speak(text){return{mode:'text_playback',text:text.slice(0,6000),audioCreated:false};}};
export const disabledTelephonyProvider={
 key:'not_configured',configured:false as const,
 capabilities:{placeCalls:false,receiveCalls:false,recordAudio:false,speechRecognition:false,speechOutput:false,transferCalls:false},
 async authenticateCallback():Promise<false>{return false;},
 async request():Promise<{state:'not_configured';confirmed:false;reason:string}>{return{state:'not_configured',confirmed:false,reason:'No documented telephony transport, phone line or staff-transfer destination is configured. No call or transfer was attempted.'};}
} satisfies VoiceStaffTransfer&{key:string;configured:false;capabilities:Record<string,false>;authenticateCallback():Promise<false>};
