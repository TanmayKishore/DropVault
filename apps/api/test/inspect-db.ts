import { prisma } from '../src/config/database.js';

async function inspectDb() {
  try {
    // 1. Inspect Enums
    const enums = await prisma.$queryRaw`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder;
    `;
    console.log('--- ACTUAL PG ENUMS ---');
    console.log(JSON.stringify(enums, null, 2));

    // 2. Inspect 'files' columns
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'files'
      ORDER BY ordinal_position;
    `;
    console.log('--- ACTUAL FILES TABLE COLUMNS ---');
    console.log(JSON.stringify(columns, null, 2));

    // 3. Inspect _prisma_migrations
    const migrations = await prisma.$queryRaw`
      SELECT id, migration_name, finished_at, rolled_back_at 
      FROM _prisma_migrations 
      ORDER BY started_at;
    `;
    console.log('--- PRISMA MIGRATIONS TABLE ---');
    console.log(JSON.stringify(migrations, null, 2));

  } catch (err) {
    console.error('Error inspecting DB:', err);
  } finally {
    await prisma.$disconnect();
  }
}

inspectDb();
