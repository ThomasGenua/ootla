import {ApiError,errorMessage} from './api';
// Presentation only: preserve the action failure and business validation without exposing setup diagnostics.
const technical=/\b(?:DEMO_MODE|DATABASE_URL|PostgreSQL|database|backend|adapter|migration|OAuth|API|server configuration|not configured|not integrated|provider unavailable|simulated AI|simulation mode|unsupported provider|transport|development setup|coming soon|not implemented|demo mode|simulated|synthetic)\b/i;
export function customerText(value:string,fallback:string):string{return technical.test(value)?fallback:value;}
export function customerError(issue:unknown,fallback='This action could not be completed. Please try again or ask your property team for help.'):string{
 const value=errorMessage(issue);if(issue instanceof ApiError&&[500,501,502,503,504].includes(issue.status))return fallback;return customerText(value,fallback);
}
