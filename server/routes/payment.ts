import { Router } from 'express';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody, validateUUID } from '../middleware/validator.js';
import { supabase } from '../index.js';
import { createError } from '../middleware/errorHandler.js';
import crypto from 'crypto';

export const paymentRouter = Router();

// POST /api/payment/create-order - Create demo payment order
paymentRouter.post(
  '/create-order',
  authenticateUser,
  validateBody(['evaluation_id']),
  validateUUID('evaluation_id', 'body'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { evaluation_id, amount } = req.body;
      const user_id = req.user!.id;

    // Verify evaluation exists and belongs to user
    const { data: evaluation, error: evalError } = await supabase
      .from('evaluations')
      .select('id, is_unlocked')
      .eq('id', evaluation_id)
      .eq('user_id', user_id)
      .single();

    if (evalError || !evaluation) {
      throw createError('Evaluation not found', 404);
    }

    if (evaluation.is_unlocked) {
      throw createError('Evaluation is already unlocked', 400);
    }

    const paymentAmount = amount || parseFloat(process.env.REPORT_UNLOCK_PRICE || '99.00');
    const transactionId = `demo_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    // Create payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        user_id,
        evaluation_id,
        amount: paymentAmount,
        currency: 'INR',
        payment_gateway: 'demo',
        transaction_id: transactionId,
        payment_status: 'pending',
      })
      .select()
      .single();

    if (paymentError) {
      throw createError(`Failed to create payment: ${paymentError.message}`, 500);
    }

    // Return demo order details (acts like real payment gateway)
    res.json({
      success: true,
      order_id: transactionId,
      amount: paymentAmount,
      currency: 'INR',
      status: 'created',
      payment: {
        id: payment.id,
        transaction_id: transactionId,
      },
      // Demo payment gateway response format
      gateway_response: {
        id: transactionId,
        amount: paymentAmount * 100, // in paise
        currency: 'INR',
        status: 'created',
        created_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    next(error);
  }
});

// POST /api/payment/verify - Verify and complete demo payment
paymentRouter.post(
  '/verify',
  authenticateUser,
  validateBody(['order_id', 'payment_id']),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { order_id, payment_id, signature } = req.body;
      const user_id = req.user!.id;

    // In demo mode, we accept any signature (in real system, verify Razorpay signature)
    // For demo: simulate successful payment verification
    const demoSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'demo_secret')
      .update(`${order_id}|${payment_id}`)
      .digest('hex');

    // Find payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*, evaluations(id, is_unlocked)')
      .eq('transaction_id', order_id)
      .eq('user_id', user_id)
      .single();

    if (paymentError || !payment) {
      throw createError('Payment not found', 404);
    }

    // Update payment status
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        payment_status: 'success',
        completed_at: new Date().toISOString(),
        gateway_response: {
          id: payment_id,
          order_id: order_id,
          signature: signature || demoSignature,
          status: 'captured',
        },
      })
      .eq('id', payment.id);

    if (updateError) {
      throw createError(`Failed to update payment: ${updateError.message}`, 500);
    }

    // Unlock evaluation
    const { error: unlockError } = await supabase
      .from('evaluations')
      .update({
        is_unlocked: true,
        unlocked_at: new Date().toISOString(),
      })
      .eq('id', payment.evaluation_id);

    if (unlockError) {
      console.error('Failed to unlock evaluation:', unlockError);
      // Don't fail the request, payment is already recorded
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      payment: {
        id: payment.id,
        transaction_id: order_id,
        status: 'success',
      },
      evaluation_unlocked: true,
    });
  } catch (error: any) {
    next(error);
  }
});

// POST /api/payment/webhook - Webhook handler (for demo, accepts any valid request)
paymentRouter.post('/webhook', async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const body = JSON.stringify(req.body);

    // In demo mode, verify signature if provided, but don't fail if missing
    if (signature && process.env.RAZORPAY_KEY_SECRET) {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.warn('Invalid webhook signature (demo mode - continuing anyway)');
      }
    }

    const event = req.body;

    // Handle payment.captured event
    if (event.event === 'payment.captured' || event.type === 'payment.captured') {
      const paymentData = event.payload?.payment?.entity || event.payload || event;
      const evaluationId = paymentData.notes?.evaluation_id || paymentData.evaluation_id;

      if (evaluationId) {
        // Update payment record
        await supabase
          .from('payments')
          .update({
            payment_status: 'success',
            completed_at: new Date().toISOString(),
            gateway_response: paymentData,
          })
          .eq('transaction_id', paymentData.id);

        // Unlock evaluation
        await supabase
          .from('evaluations')
          .update({
            is_unlocked: true,
            unlocked_at: new Date().toISOString(),
          })
          .eq('id', evaluationId);
      }
    }

    res.json({ status: 'success' });
  } catch (error: any) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

