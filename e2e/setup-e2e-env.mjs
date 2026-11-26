import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const apiDir = path.resolve(process.cwd(), 'apps', 'api');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config({ path: path.join(apiDir, '.env') });

const devUrl = new URL(process.env.DATABASE_URL);
const devDbName = devUrl.pathname.replace(/^\//, '');
const devSchema = devUrl.searchParams.get('schema') || 'public';
const devStoragePath = path.resolve(apiDir, process.env.LOCAL_STORAGE_PATH || './uploads');

const e2eSchema = 'e2e';
const e2eStoragePath = path.resolve(apiDir, 'storage', 'e2e');

console.log(`Dev DB: ${devDbName} (schema: ${devSchema})`);
console.log(`Dev Storage: ${devStoragePath}`);
console.log(`E2E DB: ${devDbName} (schema: ${e2eSchema})`);
console.log(`E2E Storage: ${e2eStoragePath}`);

if (devSchema === e2eSchema) {
  console.error('FATAL: Dev schema and E2E schema must not be the same.');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${e2eSchema}"`);
  console.log(`Ensured isolated PostgreSQL schema: ${e2eSchema}`);
} finally {
  await prisma.$disconnect();
}

const e2eUrl = new URL(devUrl.toString());
e2eUrl.searchParams.set('schema', e2eSchema);

fs.mkdirSync(e2eStoragePath, { recursive: true });

console.log(`Applying Prisma migrations to schema "${e2eSchema}"...`);
execSync('npx prisma migrate deploy', {
  cwd: apiDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: e2eUrl.toString(),
  },
});
console.log('E2E schema and storage setup complete.');

const e2ePrisma = new PrismaClient({
  datasources: { db: { url: e2eUrl.toString() } },
});
try {
  await e2ePrisma.$executeRawUnsafe(
    `DO $$ BEGIN CREATE TYPE "e2e"."StorageProvider" AS ENUM ('LOCAL', 'S3'); EXCEPTION WHEN duplicate_object THEN null; END $$;`
  );
  await e2ePrisma.$executeRawUnsafe(
    `ALTER TABLE "e2e"."files" ADD COLUMN IF NOT EXISTS "storage_provider" "e2e"."StorageProvider" NOT NULL DEFAULT 'LOCAL';`
  );
  console.log('Synced e2e.files.storage_provider column.');
} finally {
  await e2ePrisma.$disconnect();
}

const e2ePrisma2 = new PrismaClient({
  datasources: { db: { url: e2eUrl.toString() } },
});
try {
  await e2ePrisma2.$executeRawUnsafe(
    `ALTER TYPE "e2e"."FileStatus" ADD VALUE IF NOT EXISTS 'FAILED';`
  );
  console.log('Synced e2e.FileStatus FAILED enum value.');
} finally {
  await e2ePrisma2.$disconnect();
}
