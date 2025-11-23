import dotenv from 'dotenv';
import { AppConfig } from '../types/config.types';

dotenv.config();

const getEnvVar = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;
  if (!value) {
    // Log available env vars for debugging (without sensitive data)
    const envKeys = Object.keys(process.env).filter(k => 
      k.includes('POSTGRES') || k.includes('REDIS') || k.includes('NODE')
    );
    console.error(`Missing environment variable: ${key}`);
    console.error(`Available related env vars: ${envKeys.join(', ')}`);
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
};

const getEnvBoolean = (key: string, defaultValue: boolean): boolean => {
  const value = process.env[key];
  return value ? value.toLowerCase() === 'true' : defaultValue;
};

export const config: AppConfig = {
  server: {
    port: getEnvNumber('PORT', 3000),
    nodeEnv: getEnvVar('NODE_ENV', 'development'),
  },
  redis: {
    host: getEnvVar('REDIS_HOST', 'localhost'),
    port: getEnvNumber('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  postgres: {
    host: getEnvVar('POSTGRES_HOST', 'localhost'),
    port: getEnvNumber('POSTGRES_PORT', 5432),
    database: getEnvVar('POSTGRES_DB', 'order_execution'),
    user: getEnvVar('POSTGRES_USER', 'postgres'),
    password: getEnvVar('POSTGRES_PASSWORD', 'postgres'),
  },
  orderProcessing: {
    maxConcurrentOrders: getEnvNumber('MAX_CONCURRENT_ORDERS', 10),
    orderRateLimit: getEnvNumber('ORDER_RATE_LIMIT', 100),
    retryMaxAttempts: getEnvNumber('RETRY_MAX_ATTEMPTS', 3),
    retryBackoffMs: getEnvNumber('RETRY_BACKOFF_MS', 1000),
  },
  mockDex: {
    mockMode: getEnvBoolean('MOCK_MODE', true),
    delayMinMs: getEnvNumber('MOCK_DELAY_MIN_MS', 2000),
    delayMaxMs: getEnvNumber('MOCK_DELAY_MAX_MS', 3000),
  },
};
