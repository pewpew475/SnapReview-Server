import { Router } from 'express';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validator.js';
import { supabase } from '../index.js';
import { createError } from '../middleware/errorHandler.js';

export const tasksRouter = Router();

// POST /api/tasks - Create a new task
tasksRouter.post(
  '/',
  authenticateUser,
  validateBody(['title', 'code', 'language']),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { title, code, language, description, category, difficulty_level } = req.body;
      const user_id = req.user!.id;

      // Validate code length
      if (!code || code.trim().length < 10) {
        throw createError('Code must be at least 10 characters', 400);
      }

      // Create task in database
      const { data: task, error } = await supabase
        .from('tasks')
        .insert({
          user_id,
          title: title || 'Untitled Task',
          code_content: code.trim(),
          programming_language: language || 'unknown',
          description: description || '',
          category: category || 'general',
          difficulty_level: difficulty_level || 'intermediate',
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        throw createError(`Failed to create task: ${error.message}`, 500);
      }

      res.json({
        success: true,
        task: {
          id: task.id,
          title: task.title,
          language: task.programming_language,
          status: task.status,
          created_at: task.created_at,
        },
      });
    } catch (error: any) {
      next(error);
    }
  }
);

// GET /api/tasks - Get all tasks for the current user
tasksRouter.get(
  '/',
  authenticateUser,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user_id = req.user!.id;

      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('id, title, programming_language, status, created_at')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false });

      if (error) {
        throw createError('Failed to fetch tasks', 500);
      }

      // Map database column names to API field names
      const formattedTasks = (tasks || []).map((task: any) => ({
        id: task.id,
        title: task.title,
        language: task.programming_language,
        status: task.status,
        created_at: task.created_at,
      }));

      res.json({ tasks: formattedTasks });
    } catch (error: any) {
      next(error);
    }
  }
);

