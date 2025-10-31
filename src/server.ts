import { createApp } from './app.js';
import { config } from './config/index.js';
import { cacheService } from './services/cache.js';
import { databaseService } from './services/database.js';
import { logger } from './utils/logger.js';

/** Start the server */
async function start() {
  try {
    logger.info('🚀 Starting Solana Wallet Analytics API...\n');

    // Initialize services
    logger.info('📡 Connecting to services...');
    await Promise.all([cacheService.connect(), databaseService.connect()]);

    // Create Fastify app
    const app = await createApp();

    // Start listening
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logger.info('\n✨ Server is running!\n');
    logger.info(`📍 Environment: ${config.server.nodeEnv}`);
    logger.info(`🌐 URL: http://${config.server.host}:${config.server.port}`);
    logger.info(`💳 Payment Mode: ${config.payment.mode}`);
    logger.info(`⛓️  Solana Network: ${config.solana.network}\n`);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`\n${signal} received, shutting down gracefully...`);

      await app.close();
      await cacheService.disconnect();
      await databaseService.disconnect();

      logger.info('👋 Server stopped');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
start();
