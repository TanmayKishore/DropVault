import path from 'path';

export interface E2EValidationResult {
  dbName: string;
  schema: string;
  storageProvider: string;
  storagePath: string;
}

/**
 * Fail-closed safety guard for E2E execution.
 * Aborts immediately if the process is not explicitly configured for the isolated
 * E2E schema/database and E2E local storage directory.
 */
export function assertIsolatedE2EEnvironment(env: NodeJS.ProcessEnv = process.env): E2EValidationResult {
  if (env.DROPVAULT_E2E !== 'true') {
    throw new Error('E2E_GUARD_FAILED: DROPVAULT_E2E must be explicitly set to "true".');
  }

  const rawDbUrl = env.DATABASE_URL;
  if (!rawDbUrl) {
    throw new Error('E2E_GUARD_FAILED: DATABASE_URL is missing.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawDbUrl);
  } catch {
    throw new Error('E2E_GUARD_FAILED: DATABASE_URL is not a valid URL.');
  }

  const dbName = parsedUrl.pathname.replace(/^\//, '');
  const schema = parsedUrl.searchParams.get('schema') || 'public';

  if (schema !== 'e2e' && dbName !== 'dropvault_e2e') {
    throw new Error(
      `E2E_GUARD_FAILED: Refusing to run E2E against non-isolated database "${dbName}" (schema "${schema}"). Expected schema "e2e" or database "dropvault_e2e".`
    );
  }

  const storageProvider = env.STORAGE_PROVIDER || 'local';
  if (storageProvider !== 'local') {
    throw new Error(
      `E2E_GUARD_FAILED: Refusing to run E2E with STORAGE_PROVIDER="${storageProvider}". Must be "local".`
    );
  }

  const rawStoragePath = env.LOCAL_STORAGE_PATH;
  if (!rawStoragePath) {
    throw new Error('E2E_GUARD_FAILED: LOCAL_STORAGE_PATH must be explicitly set for E2E.');
  }

  const resolvedStorage = path.resolve(process.cwd(), rawStoragePath);
  const expectedE2ERoot = path.resolve(process.cwd(), 'storage', 'e2e');
  const normalizedResolved = resolvedStorage.toLowerCase();
  const normalizedExpected = expectedE2ERoot.toLowerCase();

  if (
    normalizedResolved !== normalizedExpected &&
    !normalizedResolved.startsWith(normalizedExpected + path.sep.toLowerCase())
  ) {
    throw new Error(
      `E2E_GUARD_FAILED: Refusing to run E2E with LOCAL_STORAGE_PATH="${resolvedStorage}". Must resolve inside "${expectedE2ERoot}".`
    );
  }

  return {
    dbName,
    schema,
    storageProvider,
    storagePath: resolvedStorage,
  };
}
