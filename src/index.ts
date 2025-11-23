import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import { config } from './config';
import { logger } from './utils/logger';
import { database } from './utils/database';
import { orderRoutes } from './routes/orders.routes';
import { healthRoutes } from './routes/health.routes';

async function start() {
  const fastify = Fastify({
    logger: logger,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
  });

  try {
    // Register plugins
    await fastify.register(fastifyCors, {
      origin: true, // Allow all origins in development
      credentials: true,
    });

    await fastify.register(fastifyWebsocket, {
      options: {
        clientTracking: true,
        maxPayload: 1048576, // 1MB
      },
    });

    // Initialize database
    await database.connect();
    await database.initSchema();

    // Register routes
    await fastify.register(healthRoutes, { prefix: '/api/health' });
    await fastify.register(orderRoutes, { prefix: '/api/orders' });

    // Root endpoint
    fastify.get('/', async () => {
      return {
        name: 'Order Execution Engine',
        version: '1.0.0',
        description: 'DEX Order Execution Engine with Raydium & Meteora routing',
        endpoints: {
          health: '/api/health',
          createOrder: 'POST /api/orders/execute',
          orderStatus: 'GET /api/orders/:orderId',
          allOrders: 'GET /api/orders',
          websocket: 'GET /api/orders/execute?orderId=<orderId>',
          queueMetrics: 'GET /api/orders/queue/metrics',
        },
        flow: {
          step1: 'POST /api/orders/execute - Create order and get orderId',
          step2: 'GET /api/orders/execute?orderId=<orderId> - Connect WebSocket for live updates',
        },
      };
    });

    // Start server
    await fastify.listen({
      port: config.server.port,
      host: '0.0.0.0',
    });

    logger.info(
      {
        port: config.server.port,
        nodeEnv: config.server.nodeEnv,
      },
      'Server started successfully'
    );

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);

        try {
          await fastify.close();
          await database.disconnect();
          logger.info('Server shut down successfully');
          process.exit(0);
        } catch (error) {
          logger.error({ error }, 'Error during shutdown');
          process.exit(1);
        }
      });
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        errorType: error?.constructor?.name,
      },
      'Failed to start server'
    );
    console.error('Startup error:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
  process.exit(1);
});

start();
