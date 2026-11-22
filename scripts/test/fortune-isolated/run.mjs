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
  OPENAI_API_KEY: 'synthetic-fortune-e2e-key',
  OPENAI_REQUEST_COST_USD_MICROS: '25',
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
    data: { name: `Synthetic ${label}`, type: 'ORGANIZATION' },
  });
  await db.organizationEntitlement.create({
    data: { workspaceId: workspace.id, fortunePackageEnabled: true, updatedByUserId: owner.userId },
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
  await db.workspaceMembership.createMany({
    data: [
      { workspaceId: workspace.id, userId: owner.userId, role: 'OWNER' },
      { workspaceId: workspace.id, userId: participant.userId, role: 'MEMBER' },
    ],
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
  return { slug, member, configurationId: config.id, bunshinId: bunshin.id };
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

async function browser(fixture, participant, stage = 'basic', invitationPath) {
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
        BUNSHIN_FORTUNE_TEST_STAGE: stage,
        BUNSHIN_FORTUNE_TEST_INVITATION: invitationPath ?? '',
        BUNSHIN_FORTUNE_TEST_SESSION: JSON.stringify(participant.cookies),
      },
      stdio: 'inherit',
    },
  );
  const [code] = await once(test, 'exit');
  assert.equal(code, 0, 'Mobile browser E2E');
}

function stopApp(app) {
  if (!app?.pid || app.exitCode !== null) return;
  if (process.platform !== 'win32') {
    app.kill('SIGTERM');
    return;
  }
  try {
    execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
  } catch (error) {
    // The process can exit between checking exitCode and starting taskkill.
    try {
      process.kill(app.pid, 0);
    } catch (probeError) {
      if (probeError?.code === 'ESRCH') return;
    }
    throw error;
  }
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
  const mock = join(root, 'scripts/test/fortune-isolated/openai-fixture.cjs');
  assert.ok(existsSync(next) && existsSync(mock));
  app = spawn(
    process.execPath,
    [next, 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '19000'],
    {
      cwd: webRoot,
      env: {
        ...env,
        NODE_OPTIONS: `--require "${mock.replaceAll('\\', '/')}"`,
      },
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
  await db.fortuneServiceSetting.update({
    where: { id: setting.id },
    data: { guidanceSettings: { intake: { enabled: true }, deepReadingEnabled: true } },
  });
  await put(`${base}/profile`, {
    consented: true,
    interest: '仕事',
    question: null,
    style: 'DIRECT',
  });
  const saved = (await (await request(participant, `${base}/understanding`)).json()).data;
  const priorText = '以前は家族との時間を重視していた';
  await put(`${base}/understanding`, {
    revision: saved.revision,
    profileRevision: saved.profileRevision,
    items: [{ field: 'VALUES', state: 'CONFIRMED', source: 'ANSWER', text: priorText }],
  });
  await db.fortuneParticipant.update({
    where: {
      serviceSettingId_userId: { serviceSettingId: setting.id, userId: participant.userId },
    },
    data: { understandingSavedAt: previousDay },
  });
  const otherPage = await request(other, `/s/${primary.slug}/today`);
  assert.ok(!(await otherPage.text()).includes(priorText));
  const otherService = (
    await (
      await request(participant, `/api/services/${secondary.slug}/fortune/understanding`)
    ).json()
  ).data;
  assert.deepEqual(otherService.items, []);
  await request(null, `${base}/intake`, { method: 'PATCH', status: 401 });
  const currentText = '今は働き方を整理したい';
  const create = async (text) =>
    (
      await (
        await request(participant, today, {
          method: 'POST',
          status: 201,
          body: {
            theme: 'WORK',
            intakeOutcome: 'REVIEWED',
            reviewedUnderstanding: [
              { field: 'CONSULTATION', state: 'CONFIRMED', source: 'CONSULTATION', text },
            ],
          },
        })
      ).json()
    ).data;
  await browser(primary, participant, 'deep');
  const deep = (await (await request(participant, today)).json()).data.reading;
  assert.equal(deep.status, 'READY_AI');
  assert.equal(deep.deepReading.consultationSummary, currentText);
  assert.equal((await create(currentText)).id, deep.id);
  const indexed = await db.fortuneReading.findUniqueOrThrow({ where: { id: deep.id } });
  assert.equal(indexed.pendingUnderstanding, null);
  assert.ok(indexed.personalizationContext.sources.includes('SAVED_FORTUNE_UNDERSTANDING'));
  assert.ok(!JSON.stringify(indexed.personalizationContext).includes(priorText));
  const checkpoint = await db.fortuneIntakeSession.findFirstOrThrow({
    where: { participantId: indexed.participantId },
  });
  assert.equal(checkpoint.outcome, 'REVIEWED');
  assert.equal(checkpoint.questionsShown, 1);
  await db.fortuneReading.update({
    where: { id: deep.id },
    data: { localDate: new Date(first.localDate.getTime() - 2 * 86_400_000) },
  });
  await put(`${base}/profile`, { consented: false });
  assert.ok(
    !(await (await request(participant, `/s/${primary.slug}/today`)).text()).includes(priorText),
  );
  const afterWithdrawal = await create('いま考えられることを整理したい');
  assert.equal(afterWithdrawal.status, 'READY_AI');
  assert.equal(afterWithdrawal.deepReading.consultationSummary, 'いま考えられることを整理したい');
  const ai = await db.aiUsageEvent.findMany({
    where: { bunshinId: primary.bunshinId, promptVersion: 'fortune-deep-reading-v2' },
  });
  assert.equal(ai.length, 2);
  assert.ok(
    ai.every(
      (event) =>
        event.status === 'SUCCESS' &&
        event.inputTokens === 192 &&
        event.outputTokens === 84 &&
        event.estimatedCostUsdMicros === 25n,
    ),
  );
  const dashboard = await (await request(owner, `/s/${primary.slug}/manage/fortune`)).text();
  assert.match(dashboard, /深層鑑定の利用状況/);
  assert.match(dashboard, /0\.0001/);
  assert.ok(!dashboard.includes(priorText) && !dashboard.includes(currentText));
  console.log(
    'PASS confirmed context, next-day reuse and withdrawal, deep results, isolated metrics and recorded cost',
  );
  const effectiveAt = new Date(Date.now() - 60_000);
  await db.serviceLegalDocument.createMany({
    data: [
      ['TERMS', '合成利用規約'],
      ['PRIVACY', '合成プライバシーポリシー'],
    ].map(([type, title]) => ({
      workspaceId: primary.member.workspaceId,
      groupId: primary.member.groupId,
      configurationId: primary.configurationId,
      type,
      version: 1,
      title,
      content: '隔離テスト用の合成文書です。',
      status: 'PUBLISHED',
      effectiveAt,
      publishedAt: effectiveAt,
      createdByUserId: owner.userId,
    })),
  });
  const invited = await actor('invited');
  const invitation = await request(
    owner,
    `/api/workspaces/${primary.member.workspaceId}/groups/${primary.member.groupId}/invitations`,
    { method: 'POST', body: { role: 'PARTICIPANT', serviceSlug: primary.slug }, status: 201 },
  );
  const invitationUrl = new URL((await invitation.json()).data.invitationUrl);
  assert.equal(invitationUrl.origin, origin);
  assert.ok(invitationUrl.pathname.startsWith(`/s/${primary.slug}/join/`));
  await browser(primary, invited, 'invite', invitationUrl.pathname);
  assert.ok(
    await db.groupMembership.findFirst({
      where: { groupId: primary.member.groupId, userId: invited.userId, status: 'ACTIVE' },
      select: { id: true },
    }),
    'Invite acceptance creates a service membership',
  );
  assert.equal(
    await db.serviceLegalConsent.count({
      where: { groupId: primary.member.groupId, userId: invited.userId },
    }),
    2,
    'Both published fixture documents were acknowledged',
  );
  console.log(
    'PASS scoped invitation acceptance and policy consent open the mobile Fortune age gate',
  );
  const priorGuidance = (
    await db.fortuneServiceSetting.findUniqueOrThrow({ where: { id: setting.id } })
  ).guidanceSettings;
  await browser(primary, owner, 'appearance-editor');
  await browser(primary, participant, 'appearance-viewer');
  const { appearance, ...remainingGuidance } = (
    await db.fortuneServiceSetting.findUniqueOrThrow({ where: { id: setting.id } })
  ).guidanceSettings;
  assert.equal(appearance.palette, 'night');
  assert.deepEqual(
    remainingGuidance,
    priorGuidance,
    'Editing appearance preserves existing AI settings',
  );
  assert.equal(
    (
      await db.fortuneServiceSetting.findUniqueOrThrow({
        where: { groupId: secondary.member.groupId },
      })
    ).guidanceSettings?.appearance,
    undefined,
  );
  const referralEndpoint = `/api/services/${primary.slug}/referral-code`;
  await request(participant, referralEndpoint, { method: 'POST', status: 403 });
  const scope = { workspaceId: primary.member.workspaceId, groupId: primary.member.groupId };
  await db.serviceRegistrationPolicy.update({
    where: { groupId: scope.groupId },
    data: { referralEnabled: true },
  });
  const issueCode = async () =>
    (await (await request(participant, referralEndpoint, { method: 'POST' })).json()).data;
  const referral = await issueCode();
  assert.equal((await issueCode()).code, referral.code);
  const referralPath = new URL(referral.referralUrl).pathname;
  await request(null, referralPath, { status: 404 });
  assert.doesNotMatch(
    await (await request(participant, `/s/${primary.slug}/activity`)).text(),
    /あなた専用の紹介URL/,
  );

  await db.serviceConfiguration.update({
    where: { id: primary.configurationId },
    data: { visibility: 'PUBLIC' },
  });
  await db.serviceRegistrationPolicy.update({
    where: { groupId: primary.member.groupId },
    data: { onboardingConfig: { fortunePackage: { key: 'FORTUNE_DAILY_GUIDANCE', version: 2 } } },
  });
  for (const route of [`/s/${primary.slug}`, `/s/${primary.slug}/login`]) {
    const page = await request(null, route);
    assert.match(await page.text(), /class="fortune-appearance" data-backdrop="glow"/);
  }
  console.log('PASS scoped appearance editing, public branding, and 390px participant layout');

  await db.serviceRegistrationPolicy.update({
    where: { groupId: scope.groupId },
    data: { mode: 'PUBLIC' },
  });
  const landing = await request(null, referralPath, { status: 303 });
  const landingUrl = new URL(landing.headers.get('location'), origin);
  assert.equal(landingUrl.pathname, `/s/${primary.slug}`);
  assert.equal(landingUrl.searchParams.get('ref'), referral.code);
  const referralClickId = landingUrl.searchParams.get('rc');
  assert.ok(referralClickId);
  const legalDocumentIds = (
    await db.serviceLegalDocument.findMany({
      where: scope,
      select: { id: true },
    })
  ).map(({ id }) => id);
  const referred = await actor('referred');
  const register = (actor, clickId) =>
    request(actor, `/api/services/${primary.slug}/participation`, {
      method: 'POST',
      body: { legalDocumentIds, referralCode: referral.code, referralClickId: clickId },
      status: 201,
    });
  await register(referred, referralClickId);
  await register(referred, referralClickId);
  await register(participant, null);
  const referrals = await db.serviceReferral.findMany({ where: scope });
  assert.equal(referrals.length, 1);
  assert.equal(referrals[0].referralClickId, referralClickId);
  assert.equal(referrals[0].referredUserId, referred.userId);
  assert.equal(referrals[0].qualificationState, 'UNASSESSED');
  assert.equal(await db.serviceReferralClick.count({ where: scope }), 1);
  assert.equal(await db.serviceReferralReward.count({ where: scope }), 0);
  await request(referred, `${base}/participation`, {
    method: 'POST',
    body: { ageConfirmed: true },
    status: 201,
  });
  const referredReading = await request(referred, today, {
    method: 'POST',
    body: { theme: 'LOVE' },
    status: 201,
  });
  const { data: freeReading } = await referredReading.json();
  assert.ok(['READY_BASIC', 'READY_AI'].includes(freeReading.status));
  const otherMember = await request(referred, `/s/${primary.slug}/activity`);
  assert.ok(
    !(await otherMember.text()).includes(referral.referralUrl),
    'Referral URL is private to its owner',
  );
  await browser(primary, participant, 'referral');
  console.log(
    'PASS private referral denial, public attribution, no self or duplicate attribution, and mobile referral sharing',
  );

  const adminPath = `/api/services/${primary.slug}/referral-management`;
  await request(referred, adminPath, { status: 403 });
  await db.platformAdmin.create({
    data: { userId: owner.userId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
  });
  const operatorCommand = async (body) =>
    (await (await request(owner, adminPath, { method: 'POST', body })).json()).data;
  const policy = await operatorCommand({
    kind: 'POLICY',
    authority: 'HEADQUARTERS',
    status: 'ACTIVE',
    timezone: 'Asia/Tokyo',
    expectedPolicyVersionId: null,
    reason: '隔離環境の合成設定',
    conditions: { requireFirstFreeReading: true, minimumActiveDays: 0, minimumPaidPurchases: 0 },
  });
  await request(owner, `/api/services/${primary.slug}/referral-reward-rules`, {
    method: 'POST',
    status: 201,
    body: {
      ruleKey: 'qualified-referrer',
      milestone: 'QUALIFICATION_CONFIRMED',
      recipient: 'REFERRER',
      creditAmount: 2,
      expiresAfterDays: 30,
      monthlyGrantLimit: 2,
      enabled: true,
    },
  });
  await request(referred, today);
  const target = { referralId: referrals[0].id, reason: '隔離環境の合成審査' };
  await operatorCommand({
    ...target,
    kind: 'REVIEW',
    expectedRevision: 0,
    review: 'CLEAR',
    commandId: randomUUID(),
  });
  const confirm = {
    ...target,
    kind: 'CONFIRM',
    expectedRevision: 1,
    expectedPolicyVersionId: policy.id,
    commandId: randomUUID(),
  };
  assert.equal((await operatorCommand(confirm)).state, 'CONFIRMED');
  assert.equal((await operatorCommand(confirm)).state, 'CONFIRMED');
  assert.equal(await db.serviceReferralReward.count({ where: { ...scope, status: 'GRANTED' } }), 1);
  await browser(primary, owner, 'referral-admin');
  await operatorCommand({
    ...target,
    kind: 'REVOKE',
    expectedRevision: 2,
    commandId: randomUUID(),
  });
  const balance = await db.serviceCreditAccount.findFirstOrThrow({
    where: { ...scope, userId: participant.userId },
  });
  assert.equal(balance.availableCredits, 0);
  console.log(
    'PASS free reading evidence, scoped operator settings, exact-once credit and revocation',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Isolated Fortune test failed');
  process.exitCode = 1;
} finally {
  try {
    stopApp(app);
  } finally {
    await db.$disconnect();
  }
}
