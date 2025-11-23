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

// Helper to get env var with production validation
const getRequiredEnvVar = (key: string, defaultValue?: string): string => {
  const isProduction = process.env.NODE_ENV === 'production';
  // Also check if we're likely in Render (has PORT set by Render, or RENDER env vars)
  const isRender = !!process.env.RENDER || (!!process.env.PORT && !process.env.NODE_ENV);
  const value = process.env[key] || defaultValue;
  
  // In production or Render environment, fail immediately if critical vars are missing or defaulting to localhost
  if (isProduction || isRender) {
    if (!value || value === 'localhost' || value === '127.0.0.1' || value.includes('::1')) {
      if (key.includes('HOST') || key.includes('PASSWORD')) {
        const allEnvVars = Object.keys(process.env).sort();
        console.error(`\n❌ CRITICAL ERROR: ${key} is missing or set to localhost!`);
        console.error(`Current value: ${value || 'undefined'}`);
        console.error(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
        console.error(`RENDER: ${process.env.RENDER || 'not set'}`);
        console.error(`PORT: ${process.env.PORT || 'not set'}`);
        console.error(`\nAll environment variables:`);
        allEnvVars.forEach(k => {
          const val = k.includes('PASSWORD') ? '***' : process.env[k];
          console.error(`  ${k}=${val}`);
        });
        const serviceType = key.includes('POSTGRES') ? 'PostgreSQL' : key.includes('REDIS') ? 'Redis' : 'service';
        throw new Error(
          `❌ ${key} must be set in Render environment. ` +
          `Current value: ${value || 'undefined'} (localhost). ` +
          `\n\n📋 TO FIX:\n` +
          `1. Go to Render Dashboard → ${serviceType} service → Info tab\n` +
          `2. Copy the Internal ${serviceType} URL or Hostname\n` +
          `3. Go to Web Service → Environment tab → Add ${key}\n` +
          `4. Set value to the ${serviceType} hostname (NOT localhost)\n` +
          `5. Redeploy the service\n\n` +
          `Example: ${key}=${serviceType === 'PostgreSQL' ? 'dpg-xxxxx-a.oregon-postgres.render.com' : 'red-xxxxx'}`
        );
      }
    }
  }
  
  return value || '';
};

export const config: AppConfig = {
  server: {
    port: getEnvNumber('PORT', 3000),
    nodeEnv: getEnvVar('NODE_ENV', 'development'),
  },
  redis: {
    host: getRequiredEnvVar('REDIS_HOST', process.env.NODE_ENV === 'production' ? undefined : 'localhost'),
    port: getEnvNumber('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  postgres: {
    host: getRequiredEnvVar('POSTGRES_HOST', process.env.NODE_ENV === 'production' ? undefined : 'localhost'),
    port: getEnvNumber('POSTGRES_PORT', 5432),
    database: getEnvVar('POSTGRES_DB', 'order_execution'),
    user: getEnvVar('POSTGRES_USER', 'postgres'),
    password: getRequiredEnvVar('POSTGRES_PASSWORD', process.env.NODE_ENV === 'production' ? undefined : 'postgres'),
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
