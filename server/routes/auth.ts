import { Router } from 'express';
import { validateBody } from '../middleware/validator.js';
import { supabase } from '../index.js';
import { createError } from '../middleware/errorHandler.js';

export const authRouter = Router();

// Email domain whitelist (configurable via env)
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((d: string) => d.trim().toLowerCase())
  .filter(Boolean);

// Password validation
function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password must be less than 128 characters' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }
  return { valid: true };
}

// Email domain validation
function validateEmailDomain(email: string): { valid: boolean; error?: string } {
  if (ALLOWED_EMAIL_DOMAINS.length === 0) {
    // No restrictions if env var not set
    return { valid: true };
  }

  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) {
    return { valid: false, error: 'Invalid email format' };
  }

  if (!ALLOWED_EMAIL_DOMAINS.includes(domain)) {
    return {
      valid: false,
      error: `Email domain not allowed. Allowed domains: ${ALLOWED_EMAIL_DOMAINS.join(', ')}`,
    };
  }

  return { valid: true };
}

// POST /api/auth/signup - Sign up new user
authRouter.post('/signup', validateBody(['email', 'password']), async (req, res, next) => {
  try {
    const { email, password, full_name } = req.body;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw createError('Invalid email format', 400);
    }

    // Validate email domain
    const domainCheck = validateEmailDomain(email);
    if (!domainCheck.valid) {
      throw createError(domainCheck.error || 'Email domain not allowed', 400);
    }

    // Validate password
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      throw createError(passwordCheck.error || 'Password does not meet requirements', 400);
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: full_name || 'User',
        },
        emailRedirectTo: process.env.VITE_APP_URL || 'http://localhost:8080',
      },
    });

    if (error) {
      throw createError(error.message, 400);
    }

    // Auto-confirm user in development mode (bypasses email verification)
    if (process.env.NODE_ENV !== 'production' && data.user && !data.session) {
      try {
        // Import admin client
        const { createClient: createAdminClient } = await import('@supabase/supabase-js');
        const supabaseAdmin = createAdminClient(
          process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
          process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
        );

        // Update user to confirm email
        const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          data.user.id,
          { email_confirm: true }
        );

        if (!updateError && updatedUser.user) {
          // Sign in the user to get a session
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (!signInError && signInData.session) {
            return res.json({
              success: true,
              user: {
                id: signInData.user.id,
                email: signInData.user.email,
              },
              session: signInData.session,
              message: 'Account created and auto-confirmed (development mode)',
            });
          }
        }
      } catch (adminError: any) {
        console.warn('Auto-confirm failed (this is OK if email confirmation is disabled):', adminError.message);
        // Continue with normal flow
      }
    }

    res.json({
      success: true,
      user: {
        id: data.user?.id,
        email: data.user?.email,
      },
      session: data.session,
      requiresEmailConfirmation: !data.session,
    });
  } catch (error: any) {
    next(error);
  }
});

// POST /api/auth/signin - Sign in user
authRouter.post('/signin', validateBody(['email', 'password']), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw createError(error.message, 401);
    }

    res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: data.session,
      access_token: data.session?.access_token,
    });
  } catch (error: any) {
    next(error);
  }
});

// POST /api/auth/signout - Sign out user
authRouter.post('/signout', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (token) {
      await supabase.auth.signOut();
    }

    res.json({ success: true, message: 'Signed out successfully' });
  } catch (error: any) {
    next(error);
  }
});

// GET /api/auth/user - Get current user
authRouter.get('/user', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError('Missing authorization token', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw createError('Invalid or expired token', 401);
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    res.json({
      user: {
        id: user.id,
        email: user.email,
        ...profile,
      },
    });
  } catch (error: any) {
    next(error);
  }
});

