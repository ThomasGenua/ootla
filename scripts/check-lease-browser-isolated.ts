process.env.STAGE_CHECK = '18';
process.env.OOTLA_JOURNEY_BROWSER = 'lease';
await import('./check-application-journey.js');
export {};
