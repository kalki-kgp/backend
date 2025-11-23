import { Pool, QueryResult } from 'pg';
import { config } from '../config';
import { logger } from './logger';

class Database {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected database error');
    });
  }

  async query(text: string, params?: unknown[]): Promise<QueryResult> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug({ text, duration, rows: result.rowCount }, 'Executed query');
      return result;
    } catch (error) {
      logger.error({ error, text }, 'Database query error');
      throw error;
    }
  }

  async connect(retries = 5, delay = 2000): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await this.pool.connect();
        logger.info('Database connected successfully');
        return;
      } catch (error) {
        logger.warn(
          { 
            error: error instanceof Error ? error.message : String(error),
            attempt: i + 1,
            maxRetries: retries,
            host: config.postgres.host,
            port: config.postgres.port
          },
          'Failed to connect to database, retrying...'
        );
        
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 1.5; // Exponential backoff
        } else {
          logger.error({ error }, 'Failed to connect to database after all retries');
          throw error;
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection closed');
  }

  async initSchema(): Promise<void> {
    const schema = `
      CREATE TABLE IF NOT EXISTS orders (
        order_id VARCHAR(36) PRIMARY KEY,
        type VARCHAR(20) NOT NULL,
        token_in VARCHAR(44) NOT NULL,
        token_out VARCHAR(44) NOT NULL,
        amount_in DECIMAL(20, 8) NOT NULL,
        slippage DECIMAL(5, 4) NOT NULL,
        status VARCHAR(20) NOT NULL,
        selected_dex VARCHAR(20),
        executed_price DECIMAL(20, 8),
        amount_out DECIMAL(20, 8),
        tx_hash VARCHAR(128),
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(type);

      CREATE TABLE IF NOT EXISTS order_events (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(36) NOT NULL REFERENCES orders(order_id),
        status VARCHAR(20) NOT NULL,
        data JSONB,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_events_timestamp ON order_events(timestamp DESC);

      CREATE TABLE IF NOT EXISTS dex_quotes (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(36) NOT NULL REFERENCES orders(order_id),
        dex VARCHAR(20) NOT NULL,
        price DECIMAL(20, 8) NOT NULL,
        amount_out DECIMAL(20, 8) NOT NULL,
        fee DECIMAL(5, 4) NOT NULL,
        price_impact DECIMAL(5, 4) NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_dex_quotes_order_id ON dex_quotes(order_id);
    `;

    try {
      await this.query(schema);
      logger.info('Database schema initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize database schema');
      throw error;
    }
  }
}

export const database = new Database();
