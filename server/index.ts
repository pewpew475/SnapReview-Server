// Load environment variables FIRST, before any other imports
// This ensures env vars are available when modules are evaluated
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';

// Try .env.local first, then fall back to .env
const envLocalResult = dotenv.config({ path: '.env.local' });
const envResult = dotenv.config({ path: '.env' });

// Debug: Log which env file was loaded (only in development)
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

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Debug: Show what Supabase variables are loaded (only in development)
if (process.env.NODE_ENV !== 'production') {
  console.log('\n📋 Environment Variables Check:');
  console.log(`  VITE_SUPABASE_URL: ${process.env.VITE_SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
  console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
  console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`  NVIDIA_API_KEY: ${process.env.NVIDIA_API_KEY ? '✅ Set' : '❌ Missing'}`);
  
  // Show all env vars that contain SUPABASE or VITE (for debugging)
  const relevantVars = Object.keys(process.env)
    .filter(key => key.includes('SUPABASE') || key.includes('VITE'))
    .sort();
  if (relevantVars.length > 0) {
    console.log('\n  Found these related environment variables:');
    relevantVars.forEach(key => {
      const value = process.env[key];
      const displayValue = value && value.length > 50 ? value.substring(0, 50) + '...' : value;
      console.log(`    ${key}=${displayValue || '(empty)'}`);
    });
  }
  console.log('');
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration. Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  console.error(`   Current values: supabaseUrl=${supabaseUrl ? 'set' : 'missing'}, serviceKey=${supabaseServiceKey ? 'set' : 'missing'}`);
  process.exit(1);
}

export const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// Middleware
const allowedOrigin = process.env.VITE_APP_URL || 'http://localhost:8080';
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (production-ready)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test endpoint to verify routes are loaded
app.get('/api/test', (req, res) => {
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

// API Routes
app.use('/api/tasks', rateLimiter, tasksRouter);
app.use('/api/evaluate', rateLimiter, evaluateRouter);
app.use('/api/evaluations', rateLimiter, evaluationsRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/auth', authRouter);

// Debug: Log registered routes (only in development)
if (process.env.NODE_ENV !== 'production') {
  console.log('\n📡 Registered API Routes:');
  console.log('  POST /api/tasks - Create task');
  console.log('  GET  /api/tasks - Get user tasks');
  console.log('  POST /api/evaluate - Complete evaluation');
  console.log('  POST /api/evaluate/stream - Streaming evaluation');
  console.log('  GET  /api/evaluations - Get all evaluations');
  console.log('  GET  /api/evaluations/:id/preview - Get evaluation preview');
  console.log('  GET  /api/evaluations/:id/full - Get full evaluation');
  console.log('  POST /api/auth/signup - Sign up');
  console.log('  POST /api/auth/signin - Sign in');
  console.log('  POST /api/auth/signout - Sign out');
  console.log('  GET  /api/auth/user - Get current user');
  console.log('');
}

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;

