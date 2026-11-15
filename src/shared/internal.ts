import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

export function internalToken(name: string) {
  const token = process.env[name];
  if (!token || Buffer.byteLength(token) < 32) throw new Error('Thiếu hoặc khóa quá ngắn: ' + name);
  return token;
}

export function internalAllowed(req: Request, name: string) {
  const actual = Buffer.from(req.get('X-Internal-Key') || '');
  const expected = Buffer.from(internalToken(name));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
