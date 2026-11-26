import http from 'http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { prisma } from './config/database.js';
import { getCleanupWorker } from './workers/cleanup.worker.js';
import { assertIsolatedE2EEnvironment } from './config/e2e-guard.js';

if (process.env.DROPVAULT_E2E === 'true') {
  const e2eInfo = assertIsolatedE2EEnvironment(process.env);
  console.log(
    `[DropVault API] E2E Isolation Active -> DB: ${e2eInfo.dbName} (schema: ${e2eInfo.schema}), Storage: ${e2eInfo.storageProvider} (${e2eInfo.storagePath})`
  );
}

const app = createApp();
const server = http.createServer(app);
const cleanupWorker = getCleanupWorker();

const startServer = (): void => {
  server.listen(config.PORT, () => {
    console.log(`[DropVault API] Server listening on port ${config.PORT} (mode: ${config.NODE_ENV})`);
    // Start automated cleanup worker
    cleanupWorker.start();
  });
};

// Graceful Shutdown handling
let isShuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[DropVault API] Received ${signal}. Initiating graceful shutdown...`);

  // Stop automated cleanup worker
  cleanupWorker.stop();

  // Close HTTP server to stop accepting new requests
  server.close(async () => {
    console.log('[DropVault API] HTTP server closed.');
    try {
      await prisma.$disconnect();
      console.log('[DropVault API] Database connection closed.');
    } catch (err) {
      console.error('[DropVault API] Error disconnecting database client:', err);
    }
    console.log('[DropVault API] Graceful shutdown complete.');
    process.exit(0);
  });

  // Force exit after 5 seconds if shutdown hangs
  setTimeout(() => {
    console.error('[DropVault API] Forced shutdown due to timeout.');
    process.exit(1);
  }, 5000).unref();
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[DropVault API] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[DropVault API] Uncaught Exception:', error);
  void shutdown('uncaughtException');
});

startServer();
