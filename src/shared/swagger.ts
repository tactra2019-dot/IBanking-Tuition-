import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';

export function createSwaggerRouter(): Router {
  const router = Router();
  const specPath = path.resolve(__dirname, '../../specs/001-payment-student-service/contracts/openapi.yaml');
  const fileContent = fs.readFileSync(specPath, 'utf8');
  const swaggerDocument = YAML.parse(fileContent);

  router.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  router.get('/docs.json', (_req, res) => res.json(swaggerDocument));
  return router;
}

