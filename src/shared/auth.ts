import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Request } from 'express';

const deriveKey = promisify(scrypt);
const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const ttl = 900;

export function secret(name: 'JWT_SECRET' | 'ACCOUNT_SERVICE_TOKEN') {
  const value = process.env[name];
  if (!value || Buffer.byteLength(value) < 32) throw new Error(`Thiếu ${name} (tối thiểu 32 byte)`);
  return value;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, hash?: string) {
  const [salt, key] = (hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(key)) return false;
  const actual = await deriveKey(password, salt, 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(key, 'hex')) && !!hash;
}

function sign(input: string) {
  return createHmac('sha256', secret('JWT_SECRET')).update(input).digest('base64url');
}

function matches(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueToken(userId: string) {
  const payload = Buffer.from(JSON.stringify({
    sub: userId, iss: 'ibanking-auth', aud: 'ibanking', exp: Math.floor(Date.now() / 1000) + ttl,
  })).toString('base64url');
  const input = `${header}.${payload}`;
  return { accessToken: `${input}.${sign(input)}`, tokenType: 'Bearer', expiresIn: ttl };
}

export function userIdFromRequest(req: Request): string | undefined {
  const token = req.get('authorization')?.match(/^Bearer ([\w.-]+)$/i)?.[1];
  if (!token || token.length > 2048) return;
  const [encodedHeader, payload, signature, extra] = token.split('.');
  if (extra !== undefined || encodedHeader !== header || !payload || !signature ||
      !matches(signature, sign(`${header}.${payload}`))) return;
  try {
    const { sub, exp, iss, aud } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (iss === 'ibanking-auth' && aud === 'ibanking' && Number.isSafeInteger(exp) &&
        exp > Math.floor(Date.now() / 1000) && typeof sub === 'string' &&
        /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sub)) return sub;
  } catch {
    return;
  }
}

export function isPaymentService(req: Request) {
  return matches(req.get('x-account-service-token') ?? '', secret('ACCOUNT_SERVICE_TOKEN'));
}
