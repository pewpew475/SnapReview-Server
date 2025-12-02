import { Router } from 'express';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody, validateUUID } from '../middleware/validator.js';
import { supabase } from '../index.js';
import { evaluateCodeComplete } from '../../lib/ai/evaluator.js';
import { createError } from '../middleware/errorHandler.js';

export const evaluateRouter = Router();

// Maximum time to wait for a single evaluation before failing (ms)
// Defaults to 60 seconds, can be overridden via EVALUATION_TIMEOUT_MS env var
const EVALUATION_TIMEOUT_MS = Number(process.env.EVALUATION_TIMEOUT_MS || '60000');

async function withEvaluationTimeout<T>(fn: () => Promise<T>): Promise<T> {
  const timeoutMs = EVALUATION_TIMEOUT_MS;

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      reject(
        new Error(
          `Evaluation timed out after ${Math.round(
            timeoutMs / 1000,
          )} seconds. Please try again with a smaller snippet or retry later.`,
        ),
      );
    }, timeoutMs);
  });

  return Promise.race([fn(), timeoutPromise]);
}

// POST /api/evaluate - Complete evaluation
evaluateRouter.post(
  '/',
  authenticateUser,
  validateBody(['task_id']),
  validateUUID('task_id', 'body'),
  async (req: AuthenticatedRequest, res, next) => {
    const startTime = Date.now();

    try {
      const { task_id } = req.body;
      const user_id = req.user!.id;

      // Fetch task from database
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', task_id)
        .eq('user_id', user_id)
        .single();

      if (taskError || !task) {
        throw createError('Task not found or unauthorized', 404);
      }

      // Update task status to processing
      await supabase
        .from('tasks')
        .update({ status: 'processing' })
        .eq('id', task_id);

      // Call NVIDIA AI for evaluation with timeout
      const evaluationResult = await withEvaluationTimeout(() =>
        evaluateCodeComplete(task),
      );

      // Store evaluation in database
      const { data: savedEvaluation, error: evalError } = await supabase
        .from('evaluations')
        .insert({
          task_id,
          user_id,
          overall_score: evaluationResult.overall_score,
          readability_score: evaluationResult.scores.readability,
          efficiency_score: evaluationResult.scores.efficiency,
          maintainability_score: evaluationResult.scores.maintainability,
          security_score: evaluationResult.scores.security,
          summary: evaluationResult.summary,
          strengths: evaluationResult.strengths,
          improvements: evaluationResult.improvements,
          refactored_code: evaluationResult.refactored_code,
          detailed_analysis: evaluationResult,
          is_unlocked: false,
          evaluation_status: 'completed',
          ai_model_used:
            process.env.NVIDIA_MODEL || 'moonshotai/kimi-k2-instruct-0905',
          processing_time_ms: Date.now() - startTime,
        })
        .select()
        .single();

      if (evalError) {
        throw createError(
          `Failed to save evaluation: ${evalError.message}`,
          500,
        );
      }

      // Update task status to completed
      await supabase
        .from('tasks')
        .update({ status: 'completed' })
        .eq('id', task_id);

      // Return preview data (limited for free tier)
      res.json({
        success: true,
        evaluation_id: savedEvaluation.id,
        preview: {
          overall_score: savedEvaluation.overall_score,
          summary: savedEvaluation.summary,
          strengths_preview: (savedEvaluation.strengths || []).slice(0, 3),
          scores: {
            readability: savedEvaluation.readability_score,
            efficiency: savedEvaluation.efficiency_score,
            maintainability: savedEvaluation.maintainability_score,
            security: savedEvaluation.security_score,
          },
        },
        is_unlocked: false,
        processing_time_ms: savedEvaluation.processing_time_ms,
      });
    } catch (error: any) {
      next(error);
    }
  },
);

// POST /api/evaluate/stream - Streaming evaluation
evaluateRouter.post(
  '/stream',
  authenticateUser,
  validateBody(['task_id']),
  validateUUID('task_id', 'body'),
  async (req: AuthenticatedRequest, res, next) => {
    const startTime = Date.now();

    try {
      const { task_id } = req.body;
      const user_id = req.user!.id;

      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', task_id)
        .eq('user_id', user_id)
        .single();

      if (taskError || !task) {
        throw createError('Task not found', 404);
      }

      // Update task status
      await supabase
        .from('tasks')
        .update({ status: 'processing' })
        .eq('id', task_id);

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        // Send initial status
        res.write(
          `data: ${JSON.stringify({
            type: 'status',
            status: 'initializing',
            message: 'Preparing code analysis...',
            progress: 0,
          })}\n\n`,
        );

        // Send analysis started
        res.write(
          `data: ${JSON.stringify({
            type: 'status',
            status: 'analyzing',
            message: 'Analyzing code structure and quality...',
            progress: 20,
          })}\n\n`,
        );

        let evaluationResult;

        try {
          // Check if NVIDIA API key is configured
          if (
            !process.env.NVIDIA_API_KEY ||
            process.env.NVIDIA_API_KEY === 'placeholder-key-missing'
          ) {
            throw new Error(
              'NVIDIA API key is not configured. Please set NVIDIA_API_KEY in your environment variables.',
            );
          }

          // Send progress update
          res.write(
            `data: ${JSON.stringify({
              type: 'progress',
              progress: 50,
              message: 'Sending code to AI for analysis...',
              elapsed: Date.now() - startTime,
            })}\n\n`,
          );

          // Evaluate with complete code (non-streaming) with timeout
          evaluationResult = await withEvaluationTimeout(() =>
            evaluateCodeComplete(task),
          );

          // Send progress update
          res.write(
            `data: ${JSON.stringify({
              type: 'progress',
              progress: 80,
              message: 'Analysis complete, processing results...',
              elapsed: Date.now() - startTime,
            })}\n\n`,
          );
        } catch (aiError: any) {
          console.error('[EVALUATE] AI evaluation error:', aiError);

          // Provide better error messages based on error type
          let errorMessage = 'AI evaluation failed';

          if (aiError.status === 401 || aiError.message?.includes('401')) {
            errorMessage =
              'NVIDIA API authentication failed. Please check your NVIDIA_API_KEY in the environment variables. The API key may be invalid, expired, or missing.';
          } else if (aiError.message) {
            errorMessage = `AI evaluation failed: ${aiError.message}`;
          } else if (aiError.status) {
            errorMessage = `AI evaluation failed with status ${aiError.status}`;
          }

          throw new Error(errorMessage);
        }

        // Send parsing status
        res.write(
          `data: ${JSON.stringify({
            type: 'status',
            status: 'parsing',
            message: 'Processing evaluation results...',
            progress: 90,
          })}\n\n`,
        );

        // Send saving status
        res.write(
          `data: ${JSON.stringify({
            type: 'status',
            status: 'saving',
            message: 'Saving evaluation results...',
            progress: 95,
          })}\n\n`,
        );

        // Save to database
        const { data: savedEvaluation, error: saveError } = await supabase
          .from('evaluations')
          .insert({
            task_id,
            user_id,
            overall_score: evaluationResult.overall_score,
            readability_score: evaluationResult.scores.readability,
            efficiency_score: evaluationResult.scores.efficiency,
            maintainability_score: evaluationResult.scores.maintainability,
            security_score: evaluationResult.scores.security,
            summary: evaluationResult.summary,
            strengths: evaluationResult.strengths,
            improvements: evaluationResult.improvements,
            refactored_code: evaluationResult.refactored_code,
            detailed_analysis: evaluationResult,
            is_unlocked: false,
            evaluation_status: 'completed',
            ai_model_used:
              process.env.NVIDIA_MODEL || 'moonshotai/kimi-k2-instruct-0905',
            processing_time_ms: Date.now() - startTime,
          })
          .select()
          .single();

        if (saveError) {
          throw new Error(`Failed to save evaluation: ${saveError.message}`);
        }

        // Update task status
        await supabase
          .from('tasks')
          .update({ status: 'completed' })
          .eq('id', task_id);

        // Send completion
        const evaluationId =
          savedEvaluation?.id ||
          (Array.isArray(savedEvaluation) ? savedEvaluation[0]?.id : null);

        res.write(
          `data: ${JSON.stringify({
            type: 'complete',
            done: true,
            evaluation_id: evaluationId,
            progress: 100,
            message: 'Evaluation complete!',
            elapsed: Date.now() - startTime,
          })}\n\n`,
        );
        res.end();
      } catch (streamError: any) {
        console.error('[EVALUATE] Stream error:', streamError);
        const errorMessage =
          streamError.message || 'An error occurred during evaluation';

        // Send error event before closing
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: errorMessage,
            progress: 0,
          })}\n\n`,
        );
        res.end();
      }
    } catch (error: any) {
      // Outer catch for route-level errors
      console.error('[EVALUATE] Route error:', error);
      if (!res.headersSent) {
        return next(error);
      } else {
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: error.message || 'An error occurred during evaluation',
            progress: 0,
          })}\n\n`,
        );
        res.end();
      }
    }
  },
);
