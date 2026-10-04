// Explicit opt-in local test runner. No production auth bypass or application changes.
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import http from 'node:http';
import { attachNextDevelopmentUpgrade } from './feedback-e2e-next-upgrade.mjs';

const root = resolve(import.meta.dirname, '../..');
const run = process.env.BUNSHIN_TEST_RUN_ID;
assert.match(run ?? '', /^[a-f0-9]{12,32}$/, 'explicit disposable run ID required');
const origin = 'http://127.0.0.1:19000';
const auth = 'http://127.0.0.1:18999';
const database = `postgresql://postgres:synthetic-local-test-only@127.0.0.1:18998/bunshin_disposable_${run}`;
const secret = 'synthetic-feedback-e2e-jwt-secret-not-production-8c09a184d3f6';
const password = `Synthetic-test-password-${run}!`;
const moduleFor = (name) => createRequire(join(root, name, 'package.json'));
const dbRequire = moduleFor('packages/database');
const entry = dbRequire.resolve('@prisma/client/index');
const { PrismaClient } = dbRequire(resolve(dirname(entry), '../../.prisma/client/index.js'));
const { createServerClient } = moduleFor('apps/web')('@supabase/ssr');
const jwt = (role) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ role, iss: 'supabase', exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url');
  return `${header}.${payload}.${createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')}`;
};
const anon = jwt('anon');
const admin = jwt('service_role');
const db = new PrismaClient({ datasources: { db: { url: database } } });
let next;
let proxy;
let closeUpgrade;
let droppedBrowserReviewDigest;
let childOutput = '';
let dropNextReviewResponse = false;
async function close() {
  closeUpgrade?.();
  if (proxy) {
    proxy.closeAllConnections();
    proxy.close();
  }
  if (next && next.exitCode === null) {
    try {
      execFileSync('taskkill', ['/PID', String(next.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch (error) {
      if (error.status !== 128) throw error;
    }
  }
  await db.$disconnect();
}
process.on('SIGINT', () => {
  void close().then(() => process.exit(0));
});
async function authRequest(path, body) {
  const response = await fetch(`${auth}/auth/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${admin}`,
      apikey: admin,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  assert.equal(response.ok, true, `local Auth ${path} status ${response.status}`);
  return response.json();
}
const sessions = new Map();
async function completeServiceFixture(configuration) {
  const data = {
    workspaceId: configuration.workspaceId,
    groupId: configuration.groupId,
    configurationId: configuration.id,
  };
  await db.serviceBrand.upsert({ where: { groupId: data.groupId }, create: data, update: {} });
  await db.serviceRegistrationPolicy.upsert({
    where: { groupId: data.groupId },
    create: data,
    update: {},
  });
}
async function session(email) {
  const cookies = [];
  const client = createServerClient(auth, anon, {
    cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  assert.equal(error, null, 'real local Auth password login failed');
  assert.ok(data.session && data.user, 'real local Auth session required');
  return { cookies, user: data.user };
}
async function fixture(label, role = 'SERVICE_OWNER') {
  const email = `${label}-${run}@example.invalid`;
  const slug = `e2e-${label}-${run}`;
  const identity = await authRequest('/admin/users', { email, password, email_confirm: true });
  const user = await db.user.create({ data: { displayName: `Synthetic ${label}` } });
  await db.authIdentity.create({
    data: { userId: user.id, provider: 'EMAIL', providerUserId: identity.id },
  });
  const workspace = await db.workspace.create({
    data: { type: 'PERSONAL', name: 'Synthetic isolated E2E' },
  });
  await db.workspaceMembership.create({
    data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' },
  });
  const group = await db.group.create({
    data: { workspaceId: workspace.id, name: 'Synthetic E2E' },
  });
  const configuration = await db.serviceConfiguration.create({
    data: {
      workspaceId: workspace.id,
      groupId: group.id,
      slug,
      displayName: 'Synthetic E2E',
      description: 'Synthetic',
      operatorName: 'Synthetic',
      createdByUserId: user.id,
      updatedByUserId: user.id,
    },
  });
  await completeServiceFixture(configuration);
  const membership = await db.groupMembership.create({
    data: {
      workspaceId: workspace.id,
      groupId: group.id,
      userId: user.id,
      serviceRole: role,
      status: 'ACTIVE',
      consentedAt: new Date(),
    },
  });
  const local = new Date(Date.now() + 9 * 3600000);
  const monday =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
    ((local.getUTCDay() + 6) % 7) * 86400000;
  const week = new Date(monday - 7 * 86400000 - 9 * 3600000);
  for (let i = 0; i < 5; i++) {
    const reporter = await db.user.create({ data: { displayName: 'Synthetic reporter' } });
    const bunshin = await db.bunshin.create({
      data: {
        workspaceId: workspace.id,
        groupId: group.id,
        ownerUserId: reporter.id,
        name: 'Synthetic',
        slug: `synthetic-${randomUUID()}`,
        type: 'COPY',
        objectiveSummary: 'Synthetic',
        audienceSummary: 'Synthetic',
        personalitySummary: 'Synthetic',
      },
    });
    for (const category of ['OPERATION', 'CONTENT', 'WAITING'])
      for (const surface of ['TODAY', 'PHOTO'])
        await db.improvementFeedback.create({
          data: {
            workspaceId: workspace.id,
            serviceId: group.id,
            bunshinId: bunshin.id,
            actorUserId: reporter.id,
            submissionKey: randomUUID(),
            packageKey: 'SOCIAL',
            category,
            surface,
            impact: 'BLOCKED',
            createdAt: new Date(week.getTime() + 86400000),
          },
        });
  }
  const login = await session(email);
  sessions.set(label, login);
  return { user, workspace, group, slug, membership, login };
}
async function request(f, path, body, cookies = f.login.cookies) {
  return fetch(`${origin}${path}`, {
    method: body ? 'POST' : 'GET',
    redirect: 'manual',
    headers: {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
      ...(body ? { origin, 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const pathFor = (f) => `/s/${f.slug}/manage/improvement-feedback`;
const apiFor = (f) => `/api/services/${f.slug}/improvement-feedback/review`;
async function handles(f) {
  const before = await db.improvementTriageCandidate.count();
  const response = await request(f, pathFor(f));
  assert.equal(response.status, 200, `real Next page status ${response.status}`);
  const html = (await response.text()).replace(/\\"/g, '"');
  assert.ok(html.includes('確認を始める'), 'real page must expose review controls');
  assert.equal(await db.improvementTriageCandidate.count(), before, 'GET must not save candidates');
  const found = [...html.matchAll(/"selectionHandle":"([A-Za-z0-9_-]{64,3000})"/g)].map(
    (match) => match[1],
  );
  assert.equal(new Set(found).size, 6, 'six real encrypted selection handles');
  return [...new Set(found)];
}
async function prepare(f, handle) {
  const response = await request(f, apiFor(f), { action: 'PREPARE', handle });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json();
  assert.equal(body.data.state, 'OPEN');
  assert.equal(typeof body.data.handle, 'string');
  return body.data.handle;
}
async function main() {
  const live = await db.$queryRawUnsafe(
    "SELECT current_database() AS name, shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
  );
  assert.equal(live[0]?.name, `bunshin_disposable_${run}`);
  assert.equal(live[0]?.marker, `bunshin-disposable-test:${run}`);
  assert.equal(
    await db.user.count(),
    0,
    'fresh disposable DB required; never reset an existing DB',
  );
  const mirror = mkdtempSync(join(tmpdir(), 'bunshin-feedback-e2e-'));
  const archive = join(mirror, 'source.tar');
  execFileSync('git', ['archive', 'HEAD', '-o', archive], { cwd: root });
  execFileSync('tar', ['-xf', archive, '-C', mirror]);
  for (const directory of [
    '',
    'apps/web',
    ...[
      'application',
      'auth',
      'capability-social',
      'capability-fortune',
      'capability-resale',
      'capability-training',
      'config',
      'database',
      'observability',
      'platform-domain',
      'shared',
    ].map((p) => `packages/${p}`),
  ]) {
    const source = join(root, directory, 'node_modules');
    if (existsSync(source))
      symlinkSync(source, join(mirror, directory, 'node_modules'), 'junction');
  }
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    NODE_ENV: 'development',
    APP_ENV: 'development',
    APP_URL: origin,
    DATABASE_URL: database,
    DIRECT_URL: database,
    SESSION_SECRET: `synthetic-session-secret-not-production-${run}`,
    NEXT_PUBLIC_SUPABASE_URL: auth,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anon,
    NEXT_TELEMETRY_DISABLED: '1',
    LOG_LEVEL: 'error',
    NODE_OPTIONS: `--require "${join(root, 'scripts/test/feedback-e2e-network-guard.cjs').replaceAll('\\', '/')}"`,
  };
  next = spawn(
    process.execPath,
    [
      join(root, 'apps/web/node_modules/next/dist/bin/next'),
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '19002',
    ],
    {
      cwd: join(mirror, 'apps/web'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  next.stdout.on('data', (data) => {
    childOutput += data.toString();
  });
  next.stderr.on('data', (data) => {
    childOutput += data.toString();
  });
  proxy = http.createServer((req, res) => {
    if (req.url?.startsWith('/__e2e/login/')) {
      const login = sessions.get(req.url.slice('/__e2e/login/'.length));
      if (!login) return res.writeHead(404).end();
      res.writeHead(302, {
        location: `/s/e2e-browser-${run}/manage/improvement-feedback`,
        'set-cookie': login.cookies.map(
          (c) => `${c.name}=${c.value}; Path=/; SameSite=Lax; HttpOnly`,
        ),
        'cache-control': 'no-store',
      });
      return res.end();
    }
    if (req.url === '/__e2e/drop-next-review' && req.method === 'POST') {
      if (req.headers.origin !== origin) return res.writeHead(403).end();
      dropNextReviewResponse = true;
      return res.writeHead(204).end();
    }
    let body = '';
    req.on('data', (data) => {
      body += data.toString();
    });
    const upstream = http.request(
      {
        hostname: '127.0.0.1',
        port: 19002,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: '127.0.0.1:19000' },
      },
      (result) => {
        const browserDecision =
          req.url === `/api/services/e2e-browser-${run}/improvement-feedback/review` &&
          body.includes('"action":"MARK_REVIEWED"');
        const digest = browserDecision ? createHash('sha256').update(body).digest('hex') : null;
        if (
          dropNextReviewResponse &&
          result.statusCode === 200 &&
          req.url?.endsWith('/improvement-feedback/review') &&
          body.includes('"action":"MARK_REVIEWED"')
        ) {
          dropNextReviewResponse = false;
          if (browserDecision) {
            droppedBrowserReviewDigest = digest;
            console.log('BROWSER post-commit response dropped');
          }
          result.resume();
          res.destroy();
          return;
        }
        if (browserDecision && result.statusCode === 200) {
          if (droppedBrowserReviewDigest) {
            console.log(`BROWSER replay same-body=${digest === droppedBrowserReviewDigest}`);
            droppedBrowserReviewDigest = null;
          } else console.log('BROWSER decision response 200');
        }
        res.writeHead(result.statusCode ?? 502, {
          ...result.headers,
          'content-security-policy':
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; form-action 'self'",
        });
        result.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (res.headersSent) res.destroy();
      else res.writeHead(502).end();
    });
    req.pipe(upstream);
  });
  closeUpgrade = attachNextDevelopmentUpgrade(proxy);
  await new Promise((resolve) => proxy.listen(19000, '127.0.0.1', resolve));
  for (let i = 0; i < 120; i++) {
    if (next.exitCode !== null) {
      throw new Error('isolated Next stopped before ready');
    }
    if (childOutput.includes('Ready in')) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (i === 119) throw new Error('isolated Next readiness deadline');
  }
  const a = await fixture('a');
  const b = await fixture('b');
  const viewer = await fixture('viewer', 'PARTICIPANT');
  const browser = await fixture('browser');
  const users = await db.user.count();
  const workspaces = await db.workspace.count();
  const selections = await handles(a);
  console.log('PASS real Auth session / Next GET without writes');
  for (const [index, reason] of [
    'REVIEW_COMPLETED',
    'OUT_OF_SCOPE',
    'DUPLICATE_REVIEW',
  ].entries()) {
    const handle = await prepare(a, selections[index]);
    const body = {
      action: index === 0 ? 'MARK_REVIEWED' : 'DISMISS',
      handle,
      reasonCode: reason,
      confirmation: 'RECORD_REVIEW',
    };
    const result = await request(a, apiFor(a), body);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).data.state, index === 0 ? 'REVIEWED' : 'DISMISSED');
    const count = await db.improvementTriageOperation.count();
    assert.equal((await request(a, apiFor(a), body)).status, 200);
    assert.equal(
      await db.improvementTriageOperation.count(),
      count,
      'fresh HTTP replay is one audit',
    );
  }
  console.log('PASS three decisions / repeated real HTTP responses one audit each');
  const lostHandle = await prepare(a, selections[3]);
  const lostBody = {
    action: 'MARK_REVIEWED',
    handle: lostHandle,
    reasonCode: 'REVIEW_COMPLETED',
    confirmation: 'RECORD_REVIEW',
  };
  dropNextReviewResponse = true;
  await assert.rejects(
    request(a, apiFor(a), lostBody),
    'test proxy drops real post-commit response',
  );
  assert.equal(
    await db.improvementTriageOperation.count(),
    4,
    'commit exists despite lost response',
  );
  assert.equal((await request(a, apiFor(a), lostBody)).status, 200);
  assert.equal(
    await db.improvementTriageOperation.count(),
    4,
    'same operation HTTP retry not duplicated',
  );
  console.log('PASS real HTTP post-commit response loss / replay one audit');
  const selected = await prepare(a, selections[4]);
  const body = {
    action: 'MARK_REVIEWED',
    handle: selected,
    reasonCode: 'REVIEW_COMPLETED',
    confirmation: 'RECORD_REVIEW',
  };
  assert.equal((await request(b, apiFor(a), body)).status, 404, 'other actor/scope rejected');
  assert.equal((await request(a, apiFor(b), body)).status, 404, 'other service/workspace rejected');
  assert.equal((await request(viewer, apiFor(viewer), body)).status, 404, 'nonmanager rejected');
  assert.equal(
    (await request(a, apiFor(a), body, [])).status,
    401,
    'missing real session rejected',
  );
  assert.equal(await db.improvementTriageOperation.count(), 4);
  console.log('PASS actor / service / workspace / nonmanager / anonymous rejection');
  await db.groupMembership.update({
    where: { id: a.membership.id },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });
  assert.equal((await request(a, apiFor(a), body)).status, 404, 'revoked management rejected');
  assert.equal(await db.improvementTriageOperation.count(), 4);
  assert.equal(await db.user.count(), users, 'no accidental user provision');
  assert.equal(await db.workspace.count(), workspaces, 'no accidental workspace provision');
  console.log('PASS permission revoke / no accidental provision');
  const deleted = await fetch(`${auth}/auth/v1/admin/users/${viewer.login.user.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${admin}`, apikey: admin },
  });
  assert.equal(deleted.status, 200, 'delete only synthetic Auth viewer');
  assert.equal(
    (await request(viewer, apiFor(viewer), body)).status,
    401,
    'real getUser rejects deleted Auth user',
  );
  assert.equal(await db.improvementTriageOperation.count(), 4);
  console.log('PASS deleted real Auth identity rejects old cookie (not a token-expiry test)');
  await handles(browser);
  console.log('HTTP checks complete; browser operations require separate verification.');
  if (process.env.BUNSHIN_E2E_KEEP_FOR_BROWSER === run)
    console.log(`Browser entry: ${origin}/__e2e/login/browser`);
  console.log(`Temporary source mirror: ${mirror}`);
  if (process.env.BUNSHIN_E2E_KEEP_FOR_BROWSER !== run) await close();
  // Explicit run-bound opt-in only; never leave a synthetic login server by default.
}
main().catch(async (error) => {
  console.error(error.message);
  console.error(
    childOutput
      .split('\n')
      .filter((line) => /Error:|E2E |panicked|os error|FATAL|ENOENT/.test(line))
      .map((line) =>
        line
          .replaceAll(anon, '[redacted]')
          .replaceAll(database, '[redacted]')
          .replace(/[A-Za-z0-9._+-]+@example\.invalid/g, '[synthetic identity]'),
      )
      .slice(-12)
      .join('\n'),
  );
  // Never print captured Next output: it may include cookies/request context.
  await close();
  process.exitCode = 1;
});
