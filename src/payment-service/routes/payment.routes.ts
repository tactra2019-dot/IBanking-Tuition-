import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller';

export const paymentRouter = Router();

paymentRouter.post('/payments/create-intent', paymentController.createIntent);
paymentRouter.post('/payments/confirm-otp', paymentController.confirmOtp);
paymentRouter.get('/payments/account/:accountId', paymentController.getByAccount);
paymentRouter.get('/payments/:paymentId', paymentController.getById);

