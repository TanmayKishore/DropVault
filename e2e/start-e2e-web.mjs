import path from 'path';
import { spawn } from 'child_process';

const webDir = path.resolve(process.cwd(), 'apps', 'web');

console.log('[E2E Web] Starting isolated Next.js on port 3001 (API=http://localhost:4001)');

const child = spawn('npx', ['next', 'dev', '-p', '3001'], {
  cwd: webDir,
  env: {
    ...process.env,
    NEXT_PUBLIC_API_URL: 'http://localhost:4001',
  },
  stdio: 'inherit',
  shell: true,
});

process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 0));
