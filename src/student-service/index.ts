import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createSwaggerRouter } from '../shared/swagger';
import { studentRouter } from './routes/student.routes';

export const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'student-service', status: 'ok' }));
app.use(createSwaggerRouter());
app.use('/api', studentRouter);

if (require.main === module) {
  const port = Number(process.env.PORT_STUDENT) || 4001;
  app.listen(port, () => console.log(`[student-service] listening on http://localhost:${port}`));
}

