import dotenv from 'dotenv';
import { AppConfig } from '../types/config.types';

dotenv.config();

const getEnvVar = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;
  const isProduction = process.env.NODE_ENV === 'production';
  
  // In production, fail fast if critical env vars are missing
  if (!value && isProduction && (key.includes('HOST') || key.includes('PASSWORD'))) {
    const envKeys = Object.keys(process.env).filter(k => 
      k.includes('POSTGRES') || k.includes('REDIS') || k.includes('NODE') || k.includes('DATABASE')
    ).sort();
    console.error(`\n❌ CRITICAL: Missing environment variable: ${key}`);
    console.error(`Environment: ${process.env.NODE_ENV || 'not set'}`);
    console.error(`Available environment variables:`);
    envKeys.forEach(k => {
      const val = process.env[k];
      // Show first 50 chars of value, or indicate if it's a password
      const displayVal = k.includes('PASSWORD') 
        ? '***' 
        : (val && val.length > 50 ? val.substring(0, 50) + '...' : val);
      console.error(`  ${k}=${displayVal}`);
    });
    console.error(`\nAll environment variables:`, Object.keys(process.env).sort().join(', '));
    throw new Error(`Missing required environment variable: ${key}. Check Render dashboard Environment tab.`);
  }
  
  if (!value) {
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
    // In production, don't default to localhost - fail if not set
    host: process.env.NODE_ENV === 'production' 
      ? getEnvVar('REDIS_HOST') 
      : getEnvVar('REDIS_HOST', 'localhost'),
    port: getEnvNumber('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  postgres: {
    // In production, don't default to localhost - fail if not set
    host: process.env.NODE_ENV === 'production' 
      ? getEnvVar('POSTGRES_HOST') 
      : getEnvVar('POSTGRES_HOST', 'localhost'),
    port: getEnvNumber('POSTGRES_PORT', 5432),
    database: getEnvVar('POSTGRES_DB', 'order_execution'),
    user: getEnvVar('POSTGRES_USER', 'postgres'),
    password: process.env.NODE_ENV === 'production' 
      ? getEnvVar('POSTGRES_PASSWORD') 
      : getEnvVar('POSTGRES_PASSWORD', 'postgres'),
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
