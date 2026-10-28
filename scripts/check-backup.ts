process.env.STAGE_CHECK = '19';
process.env.OOTLA_CHECK_BACKUP = 'true';
await import('./check-application-journey.js');
export {};
