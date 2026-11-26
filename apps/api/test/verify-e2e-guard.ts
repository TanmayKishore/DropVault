import { assertIsolatedE2EEnvironment } from '../src/config/e2e-guard.js';

const cases = [
  {
    name: 'dev-db-rejected',
    env: {
      DROPVAULT_E2E: 'true',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/dropvault?schema=public',
      STORAGE_PROVIDER: 'local',
      LOCAL_STORAGE_PATH: './storage/e2e',
    },
  },
  {
    name: 'dev-storage-rejected',
    env: {
      DROPVAULT_E2E: 'true',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/dropvault?schema=e2e',
      STORAGE_PROVIDER: 'local',
      LOCAL_STORAGE_PATH: './uploads',
    },
  },
  {
    name: 's3-rejected',
    env: {
      DROPVAULT_E2E: 'true',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/dropvault?schema=e2e',
      STORAGE_PROVIDER: 's3',
      LOCAL_STORAGE_PATH: './storage/e2e',
    },
  },
  {
    name: 'valid-e2e-accepted',
    env: {
      DROPVAULT_E2E: 'true',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/dropvault?schema=e2e',
      STORAGE_PROVIDER: 'local',
      LOCAL_STORAGE_PATH: './storage/e2e',
    },
  },
];

for (const c of cases) {
  try {
    const res = assertIsolatedE2EEnvironment(c.env as unknown as NodeJS.ProcessEnv);
    console.log(`${c.name}: ACCEPTED ${JSON.stringify(res)}`);
  } catch (err: any) {
    console.log(`${c.name}: REJECTED -> ${err.message}`);
  }
}
