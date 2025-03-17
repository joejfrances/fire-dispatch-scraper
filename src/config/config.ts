import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

export interface Config {
  credentials: {
    username: string;
    password: string;
  };
  urls: {
    base: string;
    login: string;
    dispatch: string;
  };
  selectors: {
    usernameSelect: string;
    passwordInput: string;
    submitButton: string;
    errorMessage: string;
  };
  supabase: {
    url: string;
    serviceKey: string;
  };
  openai: {
    apiKey: string;
    requestsPerMinute?: number;
    maxRetries?: number;
    initialBackoffMs?: number;
    circuitBreakerFailureThreshold?: number;
    circuitBreakerResetTimeoutMs?: number;
  };
}

export const config: Config = {
  credentials: {
    username: process.env.USERNAME || '1329',
    password: process.env.PASSWORD || 'drmyxeG6',
  },
  urls: {
    base: process.env.BASE_URL || 'https://redalertmobile.yonkersny.gov',
    login: '/login.ra',
    dispatch: '/dispcall.ra',
  },
  selectors: {
    usernameSelect: '#secid',
    passwordInput: '#pw',
    submitButton: '#submitbtn',
    errorMessage: '#showerr',
  },
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    requestsPerMinute: parseInt(process.env.OPENAI_REQUESTS_PER_MINUTE || '60', 10),
    maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '3', 10),
    initialBackoffMs: parseInt(process.env.OPENAI_INITIAL_BACKOFF_MS || '1000', 10),
    circuitBreakerFailureThreshold: parseInt(process.env.OPENAI_CIRCUIT_BREAKER_THRESHOLD || '5', 10),
    circuitBreakerResetTimeoutMs: parseInt(process.env.OPENAI_CIRCUIT_BREAKER_TIMEOUT_MS || '60000', 10),
  },
}; 