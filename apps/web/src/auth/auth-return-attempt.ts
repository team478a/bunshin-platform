import 'server-only';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextResponse } from 'next/server';
import type * as Database from '@bunshin/database';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger } from '@bunshin/observability';
import { trustedRequestOrigin } from './request-security';
import {
  LINE_AUTH_RETURN_COOKIE,
  LINE_AUTH_RETURN_MAX_AGE_SECONDS,
  lineAuthReturnFromCookie,
  requiresPlatformOnboarding,
  safeLineAuthReturnPath,
} from './line-return';
import {
  CUSTOM_DOMAIN_HOST_HEADER,
  normalizeRequestHostname,
} from '../services/custom-domain-routing';

export const AUTH_ATTEMPT_COOKIE_PREFIX = 'bunshin_auth_attempt_';
const ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const PROOF = /^[A-Za-z0-9_-]{43}$/;
const MAX_ACTIVE_ATTEMPTS = 4;
const logger = createLogger();
let databasePromise: Promise<typeof Database> | undefined;
const database = () => (databasePromise ??= import('@bunshin/database'));

export class AuthReturnContextError extends Error {
  constructor() {
    super('Authentication attempt is unavailable');
  }
}

export function authReturnAttemptsEnabled(): boolean {
  return process.env['AUTH_RETURN_ATTEMPTS_ENABLED'] === 'true';
}

export function validAuthAttemptId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

export function singleAuthAttemptId(values: unknown[]): string | null {
  if (values.length === 0) return null;
  if (values.length !== 1 || !validAuthAttemptId(values[0])) throw new AuthReturnContextError();
  return values[0];
}

/** Extract context only; never use an email-supplied URL as a navigation target. */
export function emailAuthAttemptId(url: URL): string | null {
  const direct = singleAuthAttemptId(url.searchParams.getAll('authAttempt'));
  const redirects = url.searchParams.getAll('redirect_to');
  if (redirects.length === 0) return direct;
  if (redirects.length !== 1) throw new AuthReturnContextError();
  let nested: URL;
  try {
    nested = new URL(redirects[0]!);
  } catch {
    throw new AuthReturnContextError();
  }
  if (
    nested.origin !== url.origin ||
    nested.pathname !== '/auth/confirm' ||
    nested.username ||
    nested.password ||
    nested.hash ||
    [...nested.searchParams.keys()].some((key) => key !== 'authAttempt')
  )
    throw new AuthReturnContextError();
  const id = singleAuthAttemptId(nested.searchParams.getAll('authAttempt'));
  if (direct && direct !== id) throw new AuthReturnContextError();
  return direct ?? id;
}

type Method = 'LINE' | 'EMAIL';
type Stage = 'PENDING' | 'CLAIMED' | 'AUTHENTICATED' | 'CONSUMED';
interface AttemptRecord {
  id: string;
  proofHash: string;
  method: Method;
  stage: Stage;
  origin: string;
  returnPath: string | null;
  pkceFlowId: string | null;
  loginIdentityHash: string | null;
  actorUserId: string | null;
  expiresAt: Date;
}
export interface AuthReturnContext {
  attempt: AttemptRecord | null;
  returnTo: string | null;
}
export interface NewAuthReturnAttempt extends AuthReturnContext {
  attempt: AttemptRecord;
  proof: string;
  staleCookieIds: string[];
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const authEmailHash = (email: string, salt: string) =>
  hash(`${salt}:${email.trim().toLowerCase()}`);
const cookieName = (id: string) => `${AUTH_ATTEMPT_COOKIE_PREFIX}${id}`;

function attemptCookies(header: string | null): Map<string, string> {
  if ((header?.length ?? 0) > 16_384) throw new AuthReturnContextError();
  const result = new Map<string, string>();
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');
    const name = part.slice(0, separator).trim();
    if (separator < 0 || !name.startsWith(AUTH_ATTEMPT_COOKIE_PREFIX)) continue;
    const id = name.slice(AUTH_ATTEMPT_COOKIE_PREFIX.length);
    if (!validAuthAttemptId(id)) continue;
    if (result.has(id)) throw new AuthReturnContextError();
    result.set(id, part.slice(separator + 1).trim());
  }
  if (result.size > 16) throw new AuthReturnContextError();
  return result;
}

function matchesProof(row: AttemptRecord, proof: string | undefined): boolean {
  return Boolean(
    proof &&
    PROOF.test(proof) &&
    /^[0-9a-f]{64}$/.test(row.proofHash) &&
    timingSafeEqual(Buffer.from(row.proofHash, 'hex'), Buffer.from(hash(proof), 'hex')),
  );
}

export async function createAuthReturnAttempt(
  request: Request,
  method: Method,
  returnTo: string | null,
  email?: string,
): Promise<NewAuthReturnAttempt> {
  const safe = safeLineAuthReturnPath(returnTo);
  if (returnTo && !safe) throw new AuthReturnContextError();
  const db = await database();
  const now = new Date();
  const browserCookies = attemptCookies(request.headers.get('cookie'));
  const pending = browserCookies.size
    ? await db.prisma.authReturnAttempt.findMany({
        where: {
          id: { in: [...browserCookies.keys()] },
          stage: { not: 'CONSUMED' },
          expiresAt: { gt: now },
        },
      })
    : [];
  const active = pending.filter((row) => matchesProof(row, browserCookies.get(row.id)));
  if (active.length >= MAX_ACTIVE_ATTEMPTS) throw new AuthReturnContextError();
  const staleCookieIds = [...browserCookies.keys()].filter(
    (id) => !active.some((row) => row.id === id),
  );
  const expired = await db.prisma.authReturnAttempt.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true },
    orderBy: { expiresAt: 'asc' },
    take: 100,
  });
  if (expired.length)
    await db.prisma.authReturnAttempt.deleteMany({
      where: { id: { in: expired.map(({ id }) => id) }, expiresAt: { lt: now } },
    });
  const proof = randomBytes(32).toString('base64url');
  const origin = trustedRequestOrigin(request);
  if (origin.length > 255 || (method === 'EMAIL' && !email)) throw new AuthReturnContextError();
  const attempt = await db.prisma.authReturnAttempt.create({
    data: {
      id: randomUUID(),
      proofHash: hash(proof),
      method,
      origin,
      returnPath: safe,
      loginIdentityHash: method === 'EMAIL' ? authEmailHash(email!, hash(proof)) : null,
      expiresAt: new Date(now.getTime() + LINE_AUTH_RETURN_MAX_AGE_SECONDS * 1000),
      createdAt: now,
    },
  });
  return { attempt, returnTo: safe, proof, staleCookieIds };
}

export function attachAuthAttemptCookie(
  response: NextResponse,
  context: NewAuthReturnAttempt,
): NextResponse {
  for (const id of context.staleCookieIds)
    response.cookies.set(cookieName(id), '', { maxAge: 0, path: '/' });
  response.cookies.set(LINE_AUTH_RETURN_COOKIE, '', { maxAge: 0, path: '/' });
  response.cookies.set(cookieName(context.attempt.id), context.proof, {
    httpOnly: true,
    sameSite: 'lax',
    secure: context.attempt.origin.startsWith('https:'),
    path: '/',
    maxAge: LINE_AUTH_RETURN_MAX_AGE_SECONDS,
  });
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
  return response;
}

export function attemptCallbackUrl(
  origin: string,
  path: string,
  context: NewAuthReturnAttempt,
): string {
  const url = new URL(path, origin);
  url.searchParams.set('authAttempt', context.attempt.id);
  return url.toString();
}

export async function setAuthAttemptPkceFlow(
  context: NewAuthReturnAttempt,
  flowId: unknown,
): Promise<void> {
  if (typeof flowId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(flowId))
    throw new AuthReturnContextError();
  const db = await database();
  const changed = await db.prisma.authReturnAttempt.updateMany({
    where: { ...scope(context), stage: 'PENDING', method: 'LINE' },
    data: { pkceFlowId: flowId },
  });
  if (changed.count !== 1) throw new AuthReturnContextError();
}

export async function readAuthReturnContext(
  request: Request,
  id: string | null,
  options: { method?: Method; actorUserId?: string; allowUnscoped?: boolean } = {},
): Promise<AuthReturnContext> {
  if (!id) {
    if (
      authReturnAttemptsEnabled() &&
      (!options.allowUnscoped || attemptCookies(request.headers.get('cookie')).size > 0)
    )
      throw new AuthReturnContextError();
    return {
      attempt: null,
      returnTo: authReturnAttemptsEnabled()
        ? null
        : lineAuthReturnFromCookie(request.headers.get('cookie')),
    };
  }
  if (!validAuthAttemptId(id)) throw new AuthReturnContextError();
  const db = await database();
  const attempt = await db.prisma.authReturnAttempt.findUnique({ where: { id } });
  if (
    !attempt ||
    !matchesProof(attempt, attemptCookies(request.headers.get('cookie')).get(id)) ||
    attempt.expiresAt <= new Date() ||
    attempt.origin !== new URL(request.url).origin ||
    (options.method && (attempt.method !== options.method || attempt.stage !== 'PENDING')) ||
    (options.actorUserId &&
      (attempt.actorUserId !== options.actorUserId || attempt.stage !== 'AUTHENTICATED')) ||
    attempt.stage === 'CONSUMED'
  )
    throw new AuthReturnContextError();
  const returnTo = safeLineAuthReturnPath(attempt.returnPath);
  if (attempt.returnPath && !returnTo) throw new AuthReturnContextError();
  return { attempt, returnTo };
}

function scope(context: AuthReturnContext) {
  if (!context.attempt) throw new AuthReturnContextError();
  return {
    id: context.attempt.id,
    proofHash: context.attempt.proofHash,
    origin: context.attempt.origin,
    expiresAt: { gt: new Date() },
  };
}

export async function claimAuthReturnAttempt(context: AuthReturnContext): Promise<void> {
  if (!context.attempt) return;
  const db = await database();
  const changed = await db.prisma.authReturnAttempt.updateMany({
    where: { ...scope(context), stage: 'PENDING' },
    data: { stage: 'CLAIMED' },
  });
  if (changed.count !== 1) throw new AuthReturnContextError();
}

export async function authenticateAuthReturnAttempt(
  context: AuthReturnContext,
  actorUserId: string,
): Promise<void> {
  if (!context.attempt) return;
  const db = await database();
  const changed = await db.prisma.authReturnAttempt.updateMany({
    where: { ...scope(context), stage: 'CLAIMED' },
    data: { stage: 'AUTHENTICATED', actorUserId },
  });
  if (changed.count !== 1) throw new AuthReturnContextError();
}

export async function consumeAuthReturnAttempt(
  context: AuthReturnContext,
  actorUserId: string,
): Promise<void> {
  if (!context.attempt) return;
  const db = await database();
  const changed = await db.prisma.authReturnAttempt.updateMany({
    where: { ...scope(context), stage: 'AUTHENTICATED', actorUserId },
    data: { stage: 'CONSUMED', returnPath: null, pkceFlowId: null, actorUserId: null },
  });
  if (changed.count !== 1) throw new AuthReturnContextError();
}

export async function cancelAuthReturnAttempt(
  context: AuthReturnContext | null,
  stage: Stage = 'PENDING',
): Promise<boolean> {
  if (!context?.attempt) return false;
  try {
    const db = await database();
    const changed = await db.prisma.authReturnAttempt.updateMany({
      where: {
        id: context.attempt.id,
        proofHash: context.attempt.proofHash,
        origin: context.attempt.origin,
        stage,
      },
      data: { stage: 'CONSUMED', returnPath: null, pkceFlowId: null, actorUserId: null },
    });
    return changed.count === 1;
  } catch {
    logger.error('auth_return_attempt_cleanup_failed', { operation: 'cancel' });
    return false;
  }
}

export function clearAuthReturnCookie(
  response: NextResponse,
  context: AuthReturnContext | null,
): NextResponse {
  response.cookies.set(
    context?.attempt ? cookieName(context.attempt.id) : LINE_AUTH_RETURN_COOKIE,
    '',
    { maxAge: 0, path: '/' },
  );
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
  return response;
}

export function authConsentPath(context: AuthReturnContext): string {
  return context.attempt ? `/consent?authAttempt=${context.attempt.id}` : '/consent';
}

export function authReturnDestination(
  context: AuthReturnContext,
  registrationStatus: string | null | undefined,
): string {
  if (!requiresPlatformOnboarding(registrationStatus, context.returnTo))
    return context.returnTo ?? '/bunshins';
  return `/onboarding${context.returnTo ? `?returnTo=${encodeURIComponent(context.returnTo)}` : ''}`;
}

export function authReturnPageRequest(path: string, headers: Headers, id: string | null): Request {
  const custom = normalizeRequestHostname(headers.get(CUSTOM_DOMAIN_HOST_HEADER));
  const origin = custom ? `https://${custom}` : new URL(getServerEnvironment().APP_URL).origin;
  const url = new URL(path, origin);
  if (id) url.searchParams.set('authAttempt', id);
  return new Request(url, { headers });
}
