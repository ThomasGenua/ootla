process.env.STAGE_CHECK='19';
process.env.OOTLA_JOURNEY_BROWSER='pilot';
await import('./check-application-journey.js');
export {};
