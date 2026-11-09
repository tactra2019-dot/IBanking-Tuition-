import { ErrorRequestHandler, Request, RequestHandler, Response, Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { sendError } from './response';

export function handle(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void fn(req, res).catch(next); };
}

export const handleError: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return sendError(res, 'JSON không hợp lệ', 400);
  if (err.type === 'entity.too.large') return sendError(res, 'Request quá lớn', 413);
  console.error('Lỗi xử lý request:', err);
  return sendError(res, 'Lỗi máy chủ', 500);
};

export function coreDocs(service: 'auth' | 'account') {
  const router = Router();
  const document = YAML.parse(fs.readFileSync(path.resolve(__dirname, '../../docs', `${service}.openapi.yaml`), 'utf8'));
  router.get('/docs.json', (_req, res) => res.json(document));
  router.use('/docs', swaggerUi.serve, swaggerUi.setup(document));
  return router;
}

