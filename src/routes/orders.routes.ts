import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { Order, OrderType, OrderStatus, CreateOrderRequest } from '../types/order.types';
import { orderModel } from '../models/order.model';
import { orderQueueService } from '../services/queue.service';
import { orderExecutionService } from '../services/orderExecution.service';
import { wsManager } from '../services/websocket.service';
import { logger } from '../utils/logger';

// Zod schema for request validation
const createOrderSchema = z.object({
  type: z.nativeEnum(OrderType),
  tokenIn: z.string().min(1).max(44),
  tokenOut: z.string().min(1).max(44),
  amountIn: z.number().positive(),
  slippage: z.number().min(0).max(0.5).optional().default(0.01),
});

export async function orderRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/orders/execute
   * Primary endpoint: Creates and executes an order
   * API validates order and returns orderId
   * Connect to WebSocket at GET /api/orders/execute?orderId=<orderId> for live status updates
   */
  fastify.post('/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as CreateOrderRequest;
      const validationResult = createOrderSchema.safeParse(body);

      if (!validationResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: validationResult.error.errors,
        });
      }

      const orderData = validationResult.data;

      // Additional business validation
      const validation = orderExecutionService.validateOrder(orderData);
      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Order validation failed',
          details: validation.errors,
        });
      }

      // Create order
      const order: Order = {
        orderId: uuidv4(),
        type: orderData.type,
        tokenIn: orderData.tokenIn,
        tokenOut: orderData.tokenOut,
        amountIn: orderData.amountIn,
        slippage: orderData.slippage,
        status: OrderStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0,
      };

      // Save to database
      await orderModel.create(order);

      // Add to queue for processing
      await orderQueueService.addOrder(order);

      logger.info({ orderId: order.orderId }, 'Order created and queued');

      return reply.status(201).send({
        orderId: order.orderId,
        status: OrderStatus.PENDING,
        message: 'Order created successfully',
        websocketUrl: `/api/orders/execute?orderId=${order.orderId}`,
        note: 'Connect to WebSocket endpoint for real-time status updates',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create order');
      return reply.status(500).send({
        error: 'Failed to create order',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/orders/execute?orderId=<orderId>
   * WebSocket endpoint for real-time order status updates
   * Connect after creating order via POST /api/orders/execute
   */
  fastify.get(
    '/execute',
    {
      websocket: true,
    },
    async (socket, req: FastifyRequest) => {
      const { orderId } = (req.query as { orderId?: string }) || {};

      if (!orderId) {
        socket.send(
          JSON.stringify({
            error: 'Missing orderId query parameter',
            message: 'Connect with: GET /api/orders/execute?orderId=<your-order-id>',
          })
        );
        socket.close();
        return;
      }

      // Verify order exists
      try {
        const order = await orderModel.getById(orderId);
        if (!order) {
          socket.send(
            JSON.stringify({
              error: 'Order not found',
              orderId,
            })
          );
          socket.close();
          return;
        }

        // Register WebSocket connection for this order
        wsManager.register(orderId, socket);

        // Send current order status
        socket.send(
          JSON.stringify({
            orderId,
            status: order.status,
            message: 'Connected to order status stream',
            currentStatus: {
              status: order.status,
              selectedDex: order.selectedDex,
              executedPrice: order.executedPrice,
              txHash: order.txHash,
            },
          })
        );

        logger.info({ orderId }, 'WebSocket connection established for order');
      } catch (error) {
        logger.error({ error, orderId }, 'Failed to establish WebSocket connection');
        socket.send(
          JSON.stringify({
            error: 'Failed to connect',
            message: error instanceof Error ? error.message : 'Unknown error',
          })
        );
        socket.close();
      }
    }
  );

  /**
   * GET /api/orders/:orderId
   * Retrieves order details by ID
   */
  fastify.get('/:orderId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = request.params as { orderId: string };

    try {
      const order = await orderModel.getById(orderId);

      if (!order) {
        return reply.status(404).send({
          error: 'Order not found',
          orderId,
        });
      }

      return reply.send(order);
    } catch (error) {
      logger.error({ error, orderId }, 'Failed to retrieve order');
      return reply.status(500).send({
        error: 'Failed to retrieve order',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/orders
   * Retrieves all orders with optional filtering
   */
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { status, limit = 50, offset = 0 } = request.query as {
      status?: OrderStatus;
      limit?: number;
      offset?: number;
    };

    try {
      const orders = await orderModel.getAll({
        status,
        limit: Number(limit),
        offset: Number(offset),
      });

      return reply.send({
        orders,
        count: orders.length,
        limit: Number(limit),
        offset: Number(offset),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to retrieve orders');
      return reply.status(500).send({
        error: 'Failed to retrieve orders',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/orders/queue/metrics
   * Retrieves queue metrics
   */
  fastify.get('/queue/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = await orderQueueService.getMetrics();
      const wsConnections = wsManager.getConnectionCount();

      return reply.send({
        queue: metrics,
        websocket: {
          activeConnections: wsConnections,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to retrieve queue metrics');
      return reply.status(500).send({
        error: 'Failed to retrieve queue metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
