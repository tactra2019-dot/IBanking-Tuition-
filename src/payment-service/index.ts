import { otpSecret } from './services/otp.service';
import { startRecoveryWorker } from './services/recovery.service';
import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { handleError } from '../shared/core-http';
import { createSwaggerRouter } from '../shared/swagger';
import { paymentRouter } from './routes/payment.routes';

export const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'payment-service', status: 'ok' }));
app.use(createSwaggerRouter());
app.use('/api', paymentRouter);
app.use(handleError);

if (require.main === module) {
  otpSecret();
  startRecoveryWorker();
  const port = Number(process.env.PORT_PAYMENT) || 4002;
  app.listen(port, process.env.SERVICE_HOST || '127.0.0.1', () => console.log(`[payment-service] listening on http://localhost:${port}`));
}
