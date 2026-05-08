import { createHmac, timingSafeEqual } from 'crypto';
import { getJwtSecret } from '@/lib/env';

export const MAX_ARTICLE_CURSOR_LENGTH = 1024;
export const MAX_ARTICLE_CURSOR_ID_LENGTH = 128;

const ISO_CURSOR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CURSOR_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface ArticleCursorInput {
  publishedAt: Date | string;
  id: string;
}

export interface ArticleCursor {
  publishedAt: Date;
  id: string;
}

interface ArticleCursorPayload {
  publishedAt: string;
  id: string;
}

export class InvalidArticleCursorError extends Error {
  constructor() {
    super('Invalid article cursor');
    this.name = 'InvalidArticleCursorError';
  }
}

function getCursorSigningSecret(): string {
  const dedicatedSecret = process.env.ARTICLE_CURSOR_SECRET;

  if (dedicatedSecret) {
    if (dedicatedSecret.length < 32) {
      throw new Error('ARTICLE_CURSOR_SECRET must be at least 32 characters');
    }

    return dedicatedSecret;
  }

  if (process.env.NODE_ENV === 'test' && !process.env.JWT_SECRET) {
    return 'test-article-cursor-signing-secret';
  }

  return getJwtSecret();
}

function parsePublishedAt(value: unknown, requireIsoFormat: boolean): Date {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new InvalidArticleCursorError();
  }

  if (requireIsoFormat && (typeof value !== 'string' || !ISO_CURSOR_DATE_PATTERN.test(value))) {
    throw new InvalidArticleCursorError();
  }

  const publishedAt = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(publishedAt.getTime())) {
    throw new InvalidArticleCursorError();
  }

  return publishedAt;
}

function parseId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ARTICLE_CURSOR_ID_LENGTH) {
    throw new InvalidArticleCursorError();
  }

  return value;
}

function parsePayload(value: unknown): ArticleCursorPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidArticleCursorError();
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  if (keys.length !== 2 || keys[0] !== 'id' || keys[1] !== 'publishedAt') {
    throw new InvalidArticleCursorError();
  }

  const publishedAt = parsePublishedAt(record.publishedAt, true);
  const id = parseId(record.id);

  return {
    publishedAt: publishedAt.toISOString(),
    id,
  };
}

function parseCursorEnvelope(value: unknown): { payload: ArticleCursorPayload; signature: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidArticleCursorError();
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  if (keys.length !== 3 || keys[0] !== 'payload' || keys[1] !== 'signature' || keys[2] !== 'v') {
    throw new InvalidArticleCursorError();
  }

  if (record.v !== 1 || typeof record.signature !== 'string' || !CURSOR_SIGNATURE_PATTERN.test(record.signature)) {
    throw new InvalidArticleCursorError();
  }

  return {
    payload: parsePayload(record.payload),
    signature: record.signature,
  };
}

function serializePayload(payload: ArticleCursorPayload): string {
  return JSON.stringify({
    publishedAt: payload.publishedAt,
    id: payload.id,
  });
}

function signPayload(payload: ArticleCursorPayload): string {
  return createHmac('sha256', getCursorSigningSecret()).update(serializePayload(payload)).digest('base64url');
}

function assertValidSignature(payload: ArticleCursorPayload, signature: string) {
  const expected = Buffer.from(signPayload(payload), 'base64url');
  const actual = Buffer.from(signature, 'base64url');

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new InvalidArticleCursorError();
  }
}

export function encodeArticleCursor(input: ArticleCursorInput): string {
  const publishedAt = parsePublishedAt(input.publishedAt, false);
  const id = parseId(input.id);
  const payload = {
    publishedAt: publishedAt.toISOString(),
    id,
  };

  return Buffer.from(
    JSON.stringify({
      v: 1,
      payload,
      signature: signPayload(payload),
    })
  ).toString('base64url');
}

export function decodeArticleCursor(cursor: string): ArticleCursor {
  if (!cursor || cursor.length > MAX_ARTICLE_CURSOR_LENGTH) {
    throw new InvalidArticleCursorError();
  }

  try {
    const { payload, signature } = parseCursorEnvelope(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    assertValidSignature(payload, signature);

    return {
      publishedAt: parsePublishedAt(payload.publishedAt, true),
      id: payload.id,
    };
  } catch (error) {
    if (error instanceof InvalidArticleCursorError) {
      throw error;
    }

    throw new InvalidArticleCursorError();
  }
}
