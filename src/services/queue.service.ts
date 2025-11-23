import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';
import { Order } from '../types/order.types';
import { logger } from '../utils/logger';
import { orderExecutionService } from './orderExecution.service';

/**
 * Order Queue Service using BullMQ
 * Manages concurrent order processing with rate limiting and retry logic
 */
export class OrderQueueService {
  private queue: Queue<Order>;
  private worker: Worker<Order>;
  private queueEvents: QueueEvents;
  private connection: IORedis;

  constructor() {
    // Create Redis connection with retry logic
    this.connection = new IORedis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.info({ times, delay, host: config.redis.host, port: config.redis.port }, 'Retrying Redis connection...');
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
      connectTimeout: 10000,
      lazyConnect: false, // Connect immediately, but with retry strategy
    });

    // Add error handlers
    this.connection.on('error', (error) => {
      logger.error({ 
        error: error.message, 
        stack: error.stack,
        host: config.redis.host,
        port: config.redis.port
      }, 'Redis connection error');
    });

    this.connection.on('connect', () => {
      logger.info({ host: config.redis.host, port: config.redis.port }, 'Redis connection established');
    });

    // Initialize queue
    this.queue = new Queue<Order>('order-execution', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: config.orderProcessing.retryMaxAttempts,
        backoff: {
          type: 'exponential',
          delay: config.orderProcessing.retryBackoffMs,
        },
        removeOnComplete: {
          age: 86400, // Keep completed jobs for 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 604800, // Keep failed jobs for 7 days
        },
      },
    });

    // Initialize worker with concurrency limit
    this.worker = new Worker<Order>(
      'order-execution',
      async (job: Job<Order>) => {
        return await this.processOrder(job);
      },
      {
        connection: this.connection.duplicate(),
        concurrency: config.orderProcessing.maxConcurrentOrders,
        limiter: {
          max: config.orderProcessing.orderRateLimit,
          duration: 60000, // per minute
        },
      }
    );

    // Queue events
    this.queueEvents = new QueueEvents('order-execution', {
      connection: this.connection.duplicate(),
    });

    this.setupEventListeners();
  }

  /**
   * Sets up event listeners for the queue
   */
  private setupEventListeners(): void {
    this.worker.on('completed', (job: Job<Order>) => {
      logger.info({ orderId: job.data.orderId }, 'Order processing completed');
    });

    this.worker.on('failed', (job: Job<Order> | undefined, error: Error) => {
      if (job) {
        logger.error(
          { orderId: job.data.orderId, error: error.message, attemptsMade: job.attemptsMade },
          'Order processing failed'
        );
      }
    });

    this.worker.on('stalled', (jobId: string) => {
      logger.warn({ jobId }, 'Job stalled');
    });

    this.queueEvents.on('waiting', ({ jobId }) => {
      logger.debug({ jobId }, 'Job waiting');
    });

    this.queueEvents.on('active', ({ jobId }) => {
      logger.debug({ jobId }, 'Job active');
    });
  }

  /**
   * Adds an order to the queue
   */
  async addOrder(order: Order): Promise<void> {
    try {
      await this.queue.add(`order-${order.orderId}`, order, {
        jobId: order.orderId,
      });

      logger.info({ orderId: order.orderId }, 'Order added to queue');
    } catch (error) {
      logger.error({ error, orderId: order.orderId }, 'Failed to add order to queue');
      throw error;
    }
  }

  /**
   * Processes an order from the queue
   */
  private async processOrder(job: Job<Order>): Promise<void> {
    const order = job.data;
    logger.info(
      { orderId: order.orderId, attempt: job.attemptsMade + 1 },
      'Processing order from queue'
    );

    try {
      await orderExecutionService.executeOrder(order);
    } catch (error) {
      logger.error({ error, orderId: order.orderId }, 'Order execution failed in queue');

      // If max retries exceeded, mark as permanently failed
      if (job.attemptsMade >= config.orderProcessing.retryMaxAttempts - 1) {
        await orderExecutionService.handleFailure(order, error as Error, true);
      }

      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Gets queue metrics
   */
  async getMetrics(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  /**
   * Pauses the queue
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    logger.info('Queue paused');
  }

  /**
   * Resumes the queue
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    logger.info('Queue resumed');
  }

  /**
   * Closes the queue and worker
   */
  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    await this.queueEvents.close();
    await this.connection.quit();
    logger.info('Queue service closed');
  }
}

export const orderQueueService = new OrderQueueService();
