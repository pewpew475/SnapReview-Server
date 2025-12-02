// Load environment variables FIRST, before any other imports
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';

const envLocalResult = dotenv.config({ path: '.env.local' });
const envResult = dotenv.config({ path: '.env' });

if (process.env.NODE_ENV !== 'production') {
  if (envLocalResult.error && !existsSync('.env.local')) {
    console.warn('⚠️  .env.local file not found. Using .env or system environment variables.');
  } else if (!envLocalResult.error) {
    console.log('✅ Loaded environment variables from .env.local');
  }
  if (envResult.error && !existsSync('.env')) {
    console.warn('⚠️  .env file not found.');
  } else if (!envResult.error && existsSync('.env')) {
    console.log('✅ Loaded environment variables from .env');
  }
}

import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { evaluateRouter } from './routes/evaluate.js';
import { evaluationsRouter } from './routes/evaluations.js';
import { tasksRouter } from './routes/tasks.js';
import { paymentRouter } from './routes/payment.js';
import { authRouter } from './routes/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (process.env.NODE_ENV !== 'production') {
  console.log('\n📋 Environment Variables Check:');
  console.log(`  VITE_SUPABASE_URL: ${process.env.VITE_SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
  console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
  console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log('');
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration. Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 🔴 SUPER-SIMPLE CORS: always reflect Origin
app.use(
  cors({
    origin: true,        // reflect request origin
    credentials: true,   // allow cookies / auth header
  }),
);

// ensure preflight gets headers too
app.options('*', cors({ origin: true, credentials: true }));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Dev logging
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Health & test
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/test', (_req, res) => {
  res.json({
    message: 'API is working',
    routes: {
      tasks: '/api/tasks',
      evaluations: '/api/evaluations',
      evaluate: '/api/evaluate',
      auth: '/api/auth',
    },
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/tasks', rateLimiter, tasksRouter);
app.use('/api/evaluate', rateLimiter, evaluateRouter);
app.use('/api/evaluations', rateLimiter, evaluationsRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/auth', authRouter);

// Dev route log
if (process.env.NODE_ENV !== 'production') {
  console.log('\n📡 Registered API Routes:');
  console.log('  POST /api/auth/signup');
  console.log('  POST /api/auth/signin');
  console.log('  POST /api/auth/signout');
  console.log('  GET  /api/auth/user');
  console.log('');
}

// Error handling
app.use(errorHandler);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
