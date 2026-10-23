import type { screeningDemoCallbackSchema } from '../../shared/screening-contracts.js';
import type { z } from 'zod';
export type ScreeningProviderEvent=z.infer<typeof screeningDemoCallbackSchema>;
/** Only an explicitly approved provider may add a live implementation after interface verification. */
export interface ScreeningAdapter{
 readonly key:string;readonly mode:'demo';readonly label:string;
 nextStatus(current:'submitted'|'provider_reviewing'):'provider_reviewing'|'report_received';
 report():Buffer;
}
