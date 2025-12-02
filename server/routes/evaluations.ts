import { Router } from 'express';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth.js';
import { validateParams, validateUUID } from '../middleware/validator.js';
import { supabase } from '../index.js';
import { createError } from '../middleware/errorHandler.js';

export const evaluationsRouter = Router();

// GET /api/evaluations - Get all evaluations for the current user
evaluationsRouter.get(
  '/',
  authenticateUser,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user_id = req.user!.id;

      // Get evaluations with task information
      const { data: evaluations, error } = await supabase
        .from('evaluations')
        .select(`
          id,
          overall_score,
          is_unlocked,
          created_at,
          task_id,
          tasks (
            id,
            title,
            programming_language,
            code_content,
            status,
            created_at
          )
        `)
        .eq('user_id', user_id)
        .order('created_at', { ascending: false });

      if (error) {
        throw createError('Failed to fetch evaluations', 500);
      }

      // Transform data for frontend
      const formattedEvaluations = (evaluations || []).map((evaluation: any) => ({
        id: evaluation.id,
        name: evaluation.tasks?.title || 'Untitled Task',
        date: new Date(evaluation.created_at).toLocaleDateString(),
        score: evaluation.overall_score,
        status: evaluation.is_unlocked ? 'unlocked' : 'locked',
        language: evaluation.tasks?.programming_language || 'Unknown',
        task_id: evaluation.task_id,
      }));

      // Get stats
      const totalTasks = formattedEvaluations.length;
      const unlockedCount = formattedEvaluations.filter((e: any) => e.status === 'unlocked').length;
      const avgScore = totalTasks > 0
        ? Math.round(formattedEvaluations.reduce((sum: number, e: any) => sum + e.score, 0) / totalTasks)
        : 0;

      res.json({
        evaluations: formattedEvaluations,
        stats: {
          totalTasks,
          unlockedCount,
          avgScore,
        },
      });
    } catch (error: any) {
      next(error);
    }
  }
);

// GET /api/evaluations/:id/preview - Get evaluation preview
evaluationsRouter.get(
  '/:id/preview',
  authenticateUser,
  validateParams(['id']),
  validateUUID('id', 'params'),
  async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const user_id = req.user!.id;

    const { data: evaluation, error } = await supabase
      .from('evaluations')
      .select('id, overall_score, summary, strengths, readability_score, efficiency_score, maintainability_score, security_score, is_unlocked, created_at')
      .eq('id', id)
      .eq('user_id', user_id)
      .single();

    if (error || !evaluation) {
      throw createError('Evaluation not found', 404);
    }

    res.json({
      id: evaluation.id,
      overall_score: evaluation.overall_score,
      summary: evaluation.summary,
      strengths_preview: (evaluation.strengths || []).slice(0, 3),
      scores: {
        readability: evaluation.readability_score,
        efficiency: evaluation.efficiency_score,
        maintainability: evaluation.maintainability_score,
        security: evaluation.security_score,
      },
      is_unlocked: evaluation.is_unlocked,
      created_at: evaluation.created_at,
    });
  } catch (error: any) {
    next(error);
  }
});

// GET /api/evaluations/:id/full - Get full evaluation (unlocked only)
evaluationsRouter.get(
  '/:id/full',
  authenticateUser,
  validateParams(['id']),
  validateUUID('id', 'params'),
  async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const user_id = req.user!.id;

    const { data: evaluation, error } = await supabase
      .from('evaluations')
      .select('*')
      .eq('id', id)
      .eq('user_id', user_id)
      .single();

    if (error || !evaluation) {
      throw createError('Evaluation not found', 404);
    }

    if (!evaluation.is_unlocked) {
      throw createError('Evaluation is locked. Payment required.', 403);
    }

    res.json({
      id: evaluation.id,
      overall_score: evaluation.overall_score,
      scores: {
        readability: evaluation.readability_score,
        efficiency: evaluation.efficiency_score,
        maintainability: evaluation.maintainability_score,
        security: evaluation.security_score,
      },
      summary: evaluation.summary,
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      refactored_code: evaluation.refactored_code,
      detailed_analysis: evaluation.detailed_analysis,
      is_unlocked: evaluation.is_unlocked,
      created_at: evaluation.created_at,
      unlocked_at: evaluation.unlocked_at,
    });
  } catch (error: any) {
    next(error);
  }
});

