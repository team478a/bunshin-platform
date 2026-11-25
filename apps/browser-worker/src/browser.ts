import { performance } from 'node:perf_hooks';
import { chromium, devices, type Page } from 'playwright';
import {
  browserPlanSchema,
  type BrowserLocator,
  type BrowserPlan,
  type BrowserRun,
  type BrowserStepEvidence,
} from '@bunshin/capability-browser';

import { observedClickTargets } from './dynamic-targets';

const origin = 'https://browser-fixture.invalid';

export interface Fixture {
  pages: ReadonlyMap<string, string>;
  samples: ReadonlyMap<string, string>;
}

export class BrowserRunError extends Error {
  constructor(
    readonly category:
      | 'INVALID_PLAN'
      | 'CANCELLED'
      | 'TIMEOUT'
      | 'STEP_FAILED'
      | 'BROWSER_UNAVAILABLE'
      | 'MODEL_SELECTION_FAILED',
    readonly stepId?: string,
  ) {
    super(stepId ? `${category}: ${stepId}` : category);
  }
}

function locate(page: Page, target: BrowserLocator) {
  if (target.by === 'role') {
    return page.getByRole(target.role, { name: target.name, exact: true });
  }
  if (target.by === 'label') return page.getByLabel(target.text, { exact: true });
  return page.getByText(target.text, { exact: true });
}

type PlanStep = BrowserPlan['steps'][number];

export type BrowserStepSelector = (
  candidates: readonly Readonly<{ id: string; action: PlanStep['action'] }>[],
  signal: AbortSignal,
) => Promise<string>;

type ObservedChoice = Extract<PlanStep, { action: 'click' }>;
export type ObservedStepSelector = (
  candidates: readonly Readonly<ObservedChoice>[],
  signal: AbortSignal,
) => Promise<string>;

async function selectBeforeAbort<T>(
  choose: (candidates: readonly T[], signal: AbortSignal) => Promise<string>,
  candidates: readonly T[],
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  let stop: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    stop = () => reject(new BrowserRunError('CANCELLED'));
    signal.addEventListener('abort', stop, { once: true });
  });
  try {
    return await Promise.race([aborted, choose(candidates, signal)]);
  } finally {
    signal.removeEventListener('abort', stop);
  }
}

export async function runBrowserPlan(
  input: unknown,
  fixture: Fixture,
  limits: { timeoutMs: number; maxSteps: number },
  cancellation: AbortSignal,
) {
  return (await executePlan(input, fixture, limits, cancellation)).run;
}

export function discoverBrowserPlan(
  input: unknown,
  fixture: Fixture,
  limits: { timeoutMs: number; maxSteps: number },
  cancellation: AbortSignal,
  select: BrowserStepSelector = (candidates) => Promise.resolve(candidates[0]?.id ?? ''),
) {
  return executePlan(input, fixture, limits, cancellation, select);
}

export function discoverObservedBrowserPlan(
  goal: Omit<BrowserPlan, 'steps'>,
  fixture: Fixture,
  limits: { timeoutMs: number; maxSteps: number },
  cancellation: AbortSignal,
  select: ObservedStepSelector,
) {
  const input = { ...goal, steps: [{ id: 'start', action: 'navigate', page: goal.startPage }] };
  return executePlan(input, fixture, limits, cancellation, undefined, undefined, select);
}

type ClickTargetFallback = Readonly<{ stepId: string; target: BrowserLocator }>;

export function verifyBrowserPlan(
  plan: BrowserPlan,
  fixture: Fixture,
  limits: { timeoutMs: number; maxSteps: number },
  cancellation: AbortSignal,
  fallback: ClickTargetFallback,
) {
  return executePlan(plan, fixture, limits, cancellation, undefined, fallback);
}

async function executePlan(
  input: unknown,
  fixture: Fixture,
  limits: { timeoutMs: number; maxSteps: number },
  cancellation: AbortSignal,
  select?: BrowserStepSelector,
  fallback?: ClickTargetFallback,
  selectObserved?: ObservedStepSelector,
): Promise<{ plan: BrowserPlan; run: BrowserRun }> {
  const parsed = browserPlanSchema.safeParse(input);
  if (!parsed.success || parsed.data.steps.length > limits.maxSteps) {
    throw new BrowserRunError('INVALID_PLAN');
  }
  const plan = parsed.data;
  const pages = new Map(
    [...fixture.pages].map(([key, body]) => [`${origin}/${key}`, { key, body }]),
  );
  const pageUrl = (key: string) => `${origin}/${key}`;
  if (
    !pages.has(pageUrl(plan.startPage)) ||
    !pages.has(pageUrl(plan.success.page)) ||
    plan.steps.some(
      (step) =>
        (step.action === 'navigate' && !pages.has(pageUrl(step.page))) ||
        (step.action === 'fill' && !fixture.samples.has(step.sample)),
    )
  ) {
    throw new BrowserRunError('INVALID_PLAN');
  }

  const startedAt = performance.now();
  const timeout = AbortSignal.timeout(limits.timeoutMs);
  const signal = AbortSignal.any([cancellation, timeout]);
  const remaining = () =>
    Math.max(1, Math.ceil(limits.timeoutMs - (performance.now() - startedAt)));
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let stepId: string | undefined;
  let cleanup: Promise<void> | undefined;
  const stop = () => {
    cleanup ??= browser?.close().catch(() => {
      // Chromium can already be gone when it aborts.
    });
  };

  try {
    signal.throwIfAborted();
    browser = await chromium.launch({
      timeout: remaining(),
      chromiumSandbox: process.platform === 'linux',
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) =>
          /^(PATH|SystemRoot|WINDIR|TEMP|TMP|TMPDIR|HOME|USERPROFILE|LANG|LC_ALL)$/i.test(key),
        ),
      ),
      args: ['--disable-background-networking'],
    });
    signal.addEventListener('abort', stop, { once: true });
    signal.throwIfAborted();
    const context = await browser.newContext({
      ...(plan.device === 'mobile'
        ? devices['Pixel 7']
        : { viewport: { width: 1280, height: 800 } }),
      locale: 'ja-JP',
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    await context.routeWebSocket('**/*', (socket) => socket.close());
    let blockedRequest = false;
    await context.route('**/*', async (route) => {
      const request = route.request();
      const page = pages.get(request.url());
      if (!page || request.method() !== 'GET' || request.resourceType() !== 'document') {
        // Chromium may request a favicon for its own UI.
        if (request.url() !== `${origin}/favicon.ico`) blockedRequest = true;
        await route.abort();
        return;
      }
      await route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: page.body,
        headers: {
          'content-security-policy':
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
        },
      });
    });
    const page = await context.newPage();
    const session = selectObserved ? await context.newCDPSession(page) : undefined;
    page.on('popup', (popup) => {
      blockedRequest = true;
      void popup.close().catch(() => {
        // Context cleanup can close the popup first.
      });
    });
    const currentPage = () => {
      const current = pages.get(page.url());
      if (blockedRequest || !current) throw new BrowserRunError('STEP_FAILED', stepId);
      return current.key;
    };
    const capture = async () => {
      const current = currentPage();
      const accessibility = await page.locator('body').ariaSnapshot({ timeout: remaining() });
      const png = await page.screenshot({ timeout: remaining(), animations: 'disabled' });
      signal.throwIfAborted();
      if (currentPage() !== current) throw new BrowserRunError('STEP_FAILED', stepId);
      return { state: { page: current, accessibility: accessibility.slice(0, 4_000) }, png };
    };

    await page.goto(pageUrl(plan.startPage), { timeout: remaining() });
    const steps: BrowserStepEvidence[] = [];
    const executed: PlanStep[] = [];
    const remainingSteps = [...plan.steps];
    const goalReached = async () =>
      currentPage() === plan.success.page && (await locate(page, plan.success.visible).isVisible());
    if (session && (await goalReached())) throw new BrowserRunError('INVALID_PLAN');
    while (session ? executed.length < limits.maxSteps : remainingSteps.length > 0) {
      if ((select || session) && executed.length > 0 && (await goalReached())) break;
      const candidates: PlanStep[] = [];
      if (select) {
        for (const step of remainingSteps) {
          if (step.action === 'navigate') continue;
          const target = locate(page, step.target);
          if ((await target.count()) !== 1 || !(await target.isVisible())) continue;
          if (step.action === 'click' && !(await target.isEnabled({ timeout: remaining() })))
            continue;
          if (step.action === 'fill' && !(await target.isEditable({ timeout: remaining() })))
            continue;
          candidates.push(step);
        }
      }
      if (session && selectObserved) {
        currentPage();
        const visible: ObservedChoice[] = [];
        for (const step of await observedClickTargets(session, executed.length + 1)) {
          signal.throwIfAborted();
          const target = locate(page, step.target);
          if (
            (await target.count()) === 1 &&
            (await target.isVisible()) &&
            (await target.isEnabled({ timeout: remaining() }))
          )
            visible.push(step);
        }
        if (!visible.length) throw new BrowserRunError('STEP_FAILED', stepId);
        const selectedId = await selectBeforeAbort(
          selectObserved,
          structuredClone(visible),
          signal,
        );
        const observed = visible.find(({ id }) => id === selectedId);
        if (!observed) throw new BrowserRunError('STEP_FAILED', stepId);
        candidates.push(observed);
      }
      const selectedId =
        select && candidates.length
          ? await selectBeforeAbort(
              select,
              candidates.map(({ id, action }) => ({ id, action })),
              signal,
            )
          : undefined;
      signal.throwIfAborted();
      let step = session
        ? candidates[0]
        : select
          ? candidates.find(({ id }) => id === selectedId)
          : remainingSteps.shift();
      if (!step) throw new BrowserRunError('STEP_FAILED');
      if (select) remainingSteps.splice(remainingSteps.indexOf(step), 1);
      if (
        step.action === 'click' &&
        fallback?.stepId === step.id &&
        (await locate(page, step.target).count()) === 0
      ) {
        if ((await locate(page, fallback.target).count()) !== 1)
          throw new BrowserRunError('STEP_FAILED', step.id);
        step = { ...step, target: fallback.target };
      }
      executed.push(step);
      stepId = step.id;
      signal.throwIfAborted();
      const box =
        step.action === 'click' || step.action === 'fill'
          ? await locate(page, step.target).boundingBox({ timeout: remaining() })
          : null;
      const viewport = box
        ? await page.evaluate(() => ({
            width: window.visualViewport?.width ?? window.innerWidth,
            height: window.visualViewport?.height ?? window.innerHeight,
            left: window.visualViewport?.offsetLeft ?? 0,
            top: window.visualViewport?.offsetTop ?? 0,
          }))
        : null;
      const before = await capture();
      switch (step.action) {
        case 'navigate':
          await page.goto(pageUrl(step.page), { timeout: remaining() });
          break;
        case 'click':
          await locate(page, step.target).click({ timeout: remaining() });
          break;
        case 'fill':
          await locate(page, step.target).fill(fixture.samples.get(step.sample)!, {
            timeout: remaining(),
          });
          break;
        case 'scroll':
          await locate(page, step.target).scrollIntoViewIfNeeded({ timeout: remaining() });
          break;
      }
      const after = await capture();
      steps.push({
        stepId,
        action: step.action,
        ...(box && viewport
          ? {
              target: {
                ...box,
                x: box.x - viewport.left,
                y: box.y - viewport.top,
                viewportWidth: viewport.width,
                viewportHeight: viewport.height,
              },
            }
          : {}),
        before: before.state,
        after: after.state,
        beforePng: before.png,
        afterPng: after.png,
      });
    }
    stepId = undefined;
    if (!(await goalReached())) {
      throw new BrowserRunError('STEP_FAILED');
    }
    signal.throwIfAborted();
    return {
      plan: { ...plan, steps: executed },
      run: {
        steps,
        browserVersion: browser.version(),
        device: plan.device,
        durationMs: Math.round(performance.now() - startedAt),
        verifiedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (cancellation.aborted) throw new BrowserRunError('CANCELLED', stepId);
    if (timeout.aborted || remaining() === 1) throw new BrowserRunError('TIMEOUT', stepId);
    if (error instanceof BrowserRunError) throw error;
    throw new BrowserRunError(browser ? 'STEP_FAILED' : 'BROWSER_UNAVAILABLE', stepId);
  } finally {
    signal.removeEventListener('abort', stop);
    stop();
    await cleanup;
  }
}
