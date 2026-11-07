import { Response } from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isUuid = (v: string) => UUID_RE.test(v.trim());
export const isEmail = (v: string) => EMAIL_RE.test(v.trim());

export const sendSuccess = <T>(res: Response, data: T, message?: string, status = 200) =>
  res.status(status).json({ success: true, message, data });

export const sendError = (res: Response, message: string, status = 400, errors?: unknown) =>
  res.status(status).json({ success: false, message, errors });
