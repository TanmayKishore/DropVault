import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv');

const apiDir = path.resolve(process.cwd(), 'apps', 'api');
dotenv.config({ path: path.join(apiDir, '.env') });

const e2eDbUrl = new URL(process.env.DATABASE_URL);
e2eDbUrl.searchParams.set('schema', 'e2e');

const e2eEnv = {
  ...process.env,
  PORT: '4001',
  CORS_ORIGIN: 'http://localhost:3001',
  DROPVAULT_E2E: 'true',
  STORAGE_PROVIDER: 'local',
  LOCAL_STORAGE_PATH: './storage/e2e',
  DATABASE_URL: e2eDbUrl.toString(),
};

console.log('[E2E API] Starting isolated API on port 4001 (schema=e2e, storage=./storage/e2e)');

const child = spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: apiDir,
  env: e2eEnv,
  stdio: 'inherit',
  shell: true,
});

process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 0));
