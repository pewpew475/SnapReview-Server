import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../index.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
  };
}

/**
 * Middleware to verify Supabase JWT token
 */
export async function authenticateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log(`[AUTH] Missing auth header for ${req.method} ${req.path}`);
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token || token.length < 10) {
      console.log(`[AUTH] Invalid token format for ${req.method} ${req.path}`);
      return res.status(401).json({ error: 'Invalid token format' });
    }

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      console.log(`[AUTH] Token verification failed for ${req.method} ${req.path}:`, error.message);
      return res.status(401).json({ error: `Invalid or expired token: ${error.message}` });
    }

    if (!user) {
      console.log(`[AUTH] No user found for token on ${req.method} ${req.path}`);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (error: any) {
    console.error(`[AUTH] Authentication error for ${req.method} ${req.path}:`, error);
    return res.status(401).json({ error: `Authentication failed: ${error.message || 'Unknown error'}` });
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      
      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
        };
      }
    }

    next();
  } catch (error) {
    // Continue even if auth fails
    next();
  }
}

