import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { internalTuition } from './routes/internal-tuition';
import { handleError } from '../shared/core-http';
import { userIdFromRequest } from '../shared/auth';
import { sendError } from '../shared/response';
import { createSwaggerRouter } from '../shared/swagger';
import { studentRouter } from './routes/student.routes';

export const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'student-service', status: 'ok' }));
app.use(createSwaggerRouter());
app.use('/internal/tuitions', internalTuition);
app.use('/api', (req, res, next) => {
  if (!userIdFromRequest(req)) return sendError(res, 'Token thiếu hoặc không hợp lệ', 401);
  next();
}, studentRouter);
app.use(handleError);

if (require.main === module) {
  const port = Number(process.env.PORT_STUDENT) || 4001;
  app.listen(port, process.env.SERVICE_HOST || '127.0.0.1', () => console.log(`[student-service] listening on http://localhost:${port}`));
}
