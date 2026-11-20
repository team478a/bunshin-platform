// Starts only against a fresh, marked loopback DB and the local GoTrue fixture.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '../../..');
const runId = process.env.BUNSHIN_TEST_RUN_ID;
assert.match(runId ?? '', /^[a-f0-9]{12,32}$/, 'Explicit disposable run ID required');
const origin = 'http://127.0.0.1:19000';
const auth = 'http://127.0.0.1:18999';
const database = `postgresql://postgres:synthetic-local-test-only@127.0.0.1:18998/bunshin_disposable_${runId}`;
const authSecret = 'synthetic-feedback-e2e-jwt-secret-not-production-8c09a184d3f6';
const password = `Synthetic-test-password-${runId}!`;
const webRoot = join(root, 'apps/web');
for (const dir of [root, webRoot]) {
  assert.ok(
    !readdirSync(dir).some((name) => /^\.env(?:$|\.(?:local|development)(?:\.local)?$)/.test(name)),
    'Use a clean worktree without dotenv files',
  );
}
const requireFromDb = createRequire(join(root, 'packages/database/package.json'));
const prismaPath = requireFromDb.resolve('@prisma/client/index');
const { PrismaClient } = requireFromDb(
  resolve(dirname(prismaPath), '../../.prisma/client/index.js'),
);
const { createServerClient } = createRequire(join(webRoot, 'package.json'))('@supabase/ssr');
const db = new PrismaClient({ datasources: { db: { url: database } } });
const sign = (role) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({ role, iss: 'supabase', exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url');
  const body = `${header}.${claims}`;
  return `${body}.${createHmac('sha256', authSecret).update(body).digest('base64url')}`;
};
const admin = sign('service_role');
const anon = sign('anon');
const env = {
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  USERPROFILE: process.env.USERPROFILE,
  LOCALAPPDATA: process.env.LOCALAPPDATA,
  TEMP: process.env.TEMP,
  CI: '1',
  APP_ENV: 'development',
  APP_URL: origin,
  DATABASE_URL: database,
  DIRECT_URL: database,
  SESSION_SECRET: `synthetic-fortune-test-${runId}`,
  NEXT_PUBLIC_SUPABASE_URL: auth,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anon,
  NEXT_TELEMETRY_DISABLED: '1',
  LOG_LEVEL: 'error',
};

async function actor(label) {
  const email = `${label}-${runId}@example.invalid`;
  const response = await fetch(`${auth}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${admin}`,
      apikey: admin,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(response.status, 200, 'Local GoTrue user provisioning');
  const identity = await response.json();
  const user = await db.user.create({ data: { displayName: `Synthetic ${label}` } });
  await db.authIdentity.create({
    data: { userId: user.id, provider: 'EMAIL', providerUserId: identity.id },
  });
  const cookies = [];
  const client = createServerClient(auth, anon, {
    cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  assert.equal(error?.name ?? null, null, 'Real local password authentication');
  assert.equal(data.user?.id, identity.id);
  assert.ok(cookies.length);
  return { userId: user.id, cookies: cookies.map(({ name, value }) => ({ name, value })) };
}

async function service(label, owner, participant) {
  const workspace = await db.workspace.create({
    data: { name: `Synthetic ${label}`, type: 'PERSONAL' },
  });
  const group = await db.group.create({ data: { workspaceId: workspace.id, name: label } });
  const scope = { workspaceId: workspace.id, groupId: group.id };
  const slug = `isolated-fortune-${label}-${runId}`;
  const config = await db.serviceConfiguration.create({
    data: {
      ...scope,
      slug,
      displayName: '隔離テスト占い',
      description: '合成データによる検証',
      operatorName: 'テスト運営',
      createdByUserId: owner.userId,
      updatedByUserId: owner.userId,
    },
  });
  const configScope = { ...scope, configurationId: config.id };
  await db.serviceBrand.create({ data: configScope });
  await db.serviceRegistrationPolicy.create({ data: { ...configScope, lineEnabled: true } });
  const membership = (user, serviceRole) =>
    db.groupMembership.create({
      data: {
        ...scope,
        userId: user.userId,
        serviceRole,
        status: 'ACTIVE',
        consentedAt: new Date(),
      },
    });
  await membership(owner, 'SERVICE_OWNER');
  const member = await membership(participant, 'PARTICIPANT');
  const bunshin = await db.bunshin.create({
    data: {
      ...scope,
      ownerUserId: owner.userId,
      name: '合成案内役',
      slug,
      type: 'COPY',
      status: 'ACTIVE',
      objectiveSummary: 'Synthetic',
      audienceSummary: 'Synthetic',
      personalitySummary: 'Synthetic',
    },
  });
  return { slug, member, bunshinId: bunshin.id };
}

async function request(actor, path, { method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      cookie: actor?.cookies.map(({ name, value }) => `${name}=${value}`).join('; ') ?? '',
      ...(method !== 'GET' ? { origin, 'content-type': 'application/json' } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(120_000),
  });
  assert.equal(response.status, status, `${method} ${path.split('?')[0]}`);
  return response;
}

async function browser(fixture, participant) {
  const test = spawn(
    process.execPath,
    [
      join(root, 'node_modules/e2e/dist/cli/bin.js'),
      'run',
      '--retries',
      '0',
      '--config',
      join(import.meta.dirname, 'e2e.config.ts'),
    ],
    {
      cwd: root,
      env: {
        ...env,
        E2E_TELEMETRY_DISABLED: '1',
        BUNSHIN_FORTUNE_TEST_SLUG: fixture.slug,
        BUNSHIN_FORTUNE_TEST_SESSION: JSON.stringify(participant.cookies),
      },
      stdio: 'inherit',
    },
  );
  const [code] = await once(test, 'exit');
  assert.equal(code, 0, 'Mobile browser E2E');
}

let app;
try {
  const [identity] = await db.$queryRawUnsafe(
    "SELECT current_database() AS name, shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
  );
  assert.equal(identity?.name, `bunshin_disposable_${runId}`);
  assert.equal(identity?.marker, `bunshin-disposable-test:${runId}`);
  assert.equal(await db.user.count(), 0, 'Fresh migrated test DB required');
  const existingApp = await fetch(origin, { signal: AbortSignal.timeout(1_000) }).catch(() => null);
  assert.equal(existingApp, null, 'Local application port is already in use');
  const next = join(webRoot, 'node_modules/next/dist/bin/next');
  const guard = join(root, 'scripts/test/feedback-e2e-network-guard.cjs');
  assert.ok(existsSync(next) && existsSync(guard));
  app = spawn(
    process.execPath,
    [next, 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '19000'],
    {
      cwd: webRoot,
      env: { ...env, NODE_OPTIONS: `--require "${guard.replaceAll('\\', '/')}"` },
      stdio: 'inherit',
    },
  );
  for (let attempt = 0; ; attempt++) {
    const ready = await fetch(`${origin}/api/health/live`, {
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
    if (ready && ready.status === 200) break;
    assert.ok(attempt < 150 && app.exitCode === null, 'Local Next readiness deadline');
    await delay(400);
  }
  const owner = await actor('owner');
  const participant = await actor('participant');
  const other = await actor('other');
  const primary = await service('first', owner, participant);
  const secondary = await service('second', owner, other);
  const operations = `/api/services/${primary.slug}/fortune-operations`;
  await request(owner, operations, {
    method: 'POST',
    status: 201,
    body: { action: 'IMPORT_STANDARD_KNOWLEDGE', bunshinId: primary.bunshinId },
  });
  const setting = await db.fortuneServiceSetting.update({
    where: { groupId: primary.member.groupId },
    data: {
      enabled: true,
      aiEnabled: true,
      personalProfileEnabled: true,
      reflectionEnabled: true,
      weeklyNotificationEnabled: true,
    },
  });
  await db.fortuneServiceSetting.create({
    data: {
      workspaceId: secondary.member.workspaceId,
      groupId: secondary.member.groupId,
      configurationId: (
        await db.serviceConfiguration.findUniqueOrThrow({ where: { slug: secondary.slug } })
      ).id,
      bunshinId: secondary.bunshinId,
      enabled: true,
    },
  });
  await db.bunshinCapabilityAssignment.create({
    data: {
      workspaceId: secondary.member.workspaceId,
      bunshinId: secondary.bunshinId,
      capabilityType: 'FORTUNE',
      status: 'ACTIVE',
      assignedByUserId: owner.userId,
    },
  });
  await db.groupMembership.createMany({
    data: [
      { scope: primary.member, userId: other.userId },
      { scope: secondary.member, userId: participant.userId },
    ].map(({ scope, userId }) => ({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      userId,
      status: 'ACTIVE',
      consentedAt: new Date(),
    })),
  });
  const base = `/api/services/${primary.slug}/fortune`;
  const today = `${base}/today`;
  await request(null, today, { status: 401 });
  await request(participant, `${base}/participation`, {
    method: 'POST',
    body: { ageConfirmed: false },
    status: 400,
  });
  await request(participant, today, { method: 'POST', body: { theme: 'WORK' }, status: 403 });
  await browser(primary, participant);
  const first = await db.fortuneReading.findFirstOrThrow({
    where: { serviceSettingId: setting.id },
  });
  assert.equal(first.memberUserId, participant.userId);
  assert.equal(first.status, 'READY_BASIC');
  assert.equal(first.failureCode, 'AI_GENERATION_FAILED');
  assert.ok(first.firstViewedAt);
  const duplicate = await request(participant, today, {
    method: 'POST',
    body: { theme: 'LOVE' },
    status: 201,
  });
  assert.equal((await duplicate.json()).data.id, first.id);
  assert.equal(await db.fortuneReading.count({ where: { serviceSettingId: setting.id } }), 1);
  const reading = `${base}/readings/${first.id}`;
  await request(other, `${base}/participation`, {
    method: 'POST',
    body: { ageConfirmed: true },
    status: 201,
  });
  await request(participant, `/api/services/${secondary.slug}/fortune/participation`, {
    method: 'POST',
    body: { ageConfirmed: true },
    status: 201,
  });
  await request(other, reading, { status: 404 });
  await request(participant, `/api/services/${secondary.slug}/fortune/readings/${first.id}`, {
    status: 404,
  });
  await request(other, `${reading}/personal-fit`, {
    method: 'PUT',
    body: { rating: 'VERY' },
    status: 404,
  });
  console.log(
    'PASS real GoTrue, mobile browser, age gate, AI-unavailable fallback, one draw and reading isolation',
  );

  const put = (path, body, status = 200) =>
    request(participant, path, { method: 'PUT', body, status });
  await put(`${base}/profile`, {
    consented: true,
    interest: '仕事',
    question: '今の役割を考えたい',
    style: 'DIRECT',
  });
  await put(`${reading}/personal-fit`, { rating: 'VERY' }, 404);
  // A synthetic completed AI result allows the real downstream API to be exercised offline.
  await db.fortuneReading.update({
    where: { id: first.id },
    data: {
      status: 'READY_AI',
      generatedAt: new Date(),
      reflectionPrompt: '考え方に変化はありましたか？',
    },
  });
  await put(`${reading}/personal-fit`, { rating: 'VERY' });
  assert.equal(
    (await db.fortuneReading.findUniqueOrThrow({ where: { id: first.id } })).personalFitRating,
    'VERY',
  );
  await put(`${reading}/personal-fit`, { rating: null });
  const ask = (requestId, status = 200) =>
    request(participant, `${reading}/follow-ups`, {
      method: 'POST',
      status,
      body: { requestId, question: '別の見方はありますか？' },
    });
  const firstRequest = randomUUID();
  assert.equal((await (await ask(firstRequest)).json()).data.remaining, 1);
  assert.equal((await (await ask(firstRequest)).json()).data.remaining, 1);
  assert.equal((await (await ask(randomUUID())).json()).data.remaining, 0);
  await ask(randomUUID(), 409);
  const previousDay = new Date(first.localDate.getTime() - 86_400_000);
  await db.fortuneReading.update({ where: { id: first.id }, data: { localDate: previousDay } });
  await put(`${reading}/reflection`, { answer: 'TRIED_CHANGED' });
  const nextDay = await request(participant, `/s/${primary.slug}/today`);
  assert.match(await nextDay.text(), /前回の提案を振り返る/);
  await put(`${base}/profile`, { consented: false });
  const turns = await db.fortuneReadingFollowUp.findMany({ where: { readingId: first.id } });
  assert.equal(turns.length, 2);
  assert.ok(
    turns.every(
      (turn) => turn.status === 'ERASED' && turn.question === null && turn.answer === null,
    ),
  );
  await put(`${reading}/reflection`, { answer: 'TRIED_CHANGED' }, 404);
  await request(participant, reading, { method: 'DELETE' });
  await request(participant, reading, { status: 404 });
  console.log(
    'PASS optional fit, two follow-up slots, replay, next-day reflection, consent withdrawal and deletion',
  );
  const preference = `/api/services/${primary.slug}/notification-preferences/FORTUNE_WEEKLY`;
  const entry = `/s/${primary.slug}/today/from-line`;
  const returns = () =>
    db.serviceMembershipEvent.count({
      where: { groupMembershipId: primary.member.id, eventType: 'FORTUNE_WEEKLY_LINE_RETURN' },
    });
  assert.equal((await (await request(participant, preference)).json()).data.enabled, false);
  await request(participant, entry, { status: 307 });
  assert.equal(await returns(), 0);
  await put(preference, { channel: 'LINE', enabled: true });
  await request(participant, entry, { status: 307 });
  await request(participant, entry, { status: 307 });
  assert.equal(await returns(), 1);
  await put(preference, { channel: 'LINE', enabled: false });
  assert.equal((await (await request(participant, preference)).json()).data.enabled, false);
  await db.serviceMembershipEvent.deleteMany({
    where: { groupMembershipId: primary.member.id, eventType: 'FORTUNE_WEEKLY_LINE_RETURN' },
  });
  await request(participant, entry, { status: 307 });
  assert.equal(await returns(), 0);
  console.log('PASS real return route, opt-in and opt-out persisted without sending LINE messages');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Isolated Fortune test failed');
  process.exitCode = 1;
} finally {
  if (app?.pid && app.exitCode === null) {
    if (process.platform === 'win32')
      execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
    else app.kill('SIGTERM');
  }
  await db.$disconnect();
}
