process.env.STAGE_CHECK='20';
process.env.OOTLA_JOURNEY_BROWSER='operations';
await import('./check-application-journey.js');
export {};
