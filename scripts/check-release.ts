import { spawn } from 'node:child_process';
import path from 'node:path';

// Each group intentionally injects terminal failures and changes access. Give
// each its own fixture instead of carrying a failed screening into a lease test.
const root = path.resolve(import.meta.dirname, '..');
for (const stage of [16, 17, 18, 19]) {
  const env: NodeJS.ProcessEnv = { ...process.env, STAGE_CHECK: String(stage), OOTLA_CHECK_BACKUP: stage === 19 ? 'true' : 'false' };
  delete env.JOURNEY_ALL; delete env.OOTLA_JOURNEY_BROWSER;
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), path.join(root, 'scripts/check-application-journey.ts')], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
  });
  if (code) { process.exitCode = code; break; }
}
