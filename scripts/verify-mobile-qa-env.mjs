import { inspectMobileQaEnv } from './lib/mobile-qa-env.mjs';

const failures = inspectMobileQaEnv(process.env);
if (failures.length > 0) {
  console.error('Build Android QA bloqueado:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Entorno Android QA aislado de producción.');
}
