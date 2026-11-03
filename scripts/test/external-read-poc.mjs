import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

const problem = (code) => new Error(code);
const sameKeys = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
function configuration(env) {
  try {
    const url = new URL(env.EXTERNAL_READ_POC_BASE_URL);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
    )
      throw problem('CONFIGURATION');
    const id = env.EXTERNAL_READ_POC_CONNECTION_ID;
    const token = env.EXTERNAL_READ_POC_ACCESS_TOKEN;
    if (
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id ?? '') ||
      typeof token !== 'string' ||
      token.length > 8192 ||
      !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)
    )
      throw problem('CONFIGURATION');
    // This is an expiry check for the test, NOT signature verification or authentication.
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (!Number.isSafeInteger(claims.exp)) throw problem('CONFIGURATION');
    return { origin: url.origin, id: id.toLowerCase(), token, expires: claims.exp * 1000 };
  } catch {
    throw problem('POC_CONFIGURATION_INVALID');
  }
}
function usage(value) {
  if (
    !sameKeys(value, ['version', 'asOf', 'timezone', 'postEvidence', 'last7Days', 'last30Days']) ||
    value.version !== 'external-member-usage-v1' ||
    value.timezone !== 'Asia/Tokyo' ||
    value.postEvidence !== 'SELF_REPORTED_NOT_VERIFIED' ||
    typeof value.asOf !== 'string' ||
    !Number.isFinite(Date.parse(value.asOf))
  )
    return false;
  return ['last7Days', 'last30Days'].every((key) => {
    const window = value[key];
    const metrics = [
      'generated',
      'unknownTriggerGenerations',
      'accepted',
      'rejected',
      'selfReportedPosts',
      'activeDays',
    ];
    return (
      sameKeys(window, ['fromLocalDate', 'throughLocalDate', ...metrics]) &&
      ['fromLocalDate', 'throughLocalDate'].every(
        (date) => typeof window[date] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(window[date]),
      ) &&
      metrics.every((metric) => Number.isSafeInteger(window[metric]) && window[metric] >= 0)
    );
  });
}

/** Uses an already issued OAuth token and an existing owner-approved grant. No live defaults. */
export async function runExternalReadPoc(
  env,
  { request = fetch, waitForRevocation, now = Date.now } = {},
) {
  const config = configuration(env);
  if (typeof waitForRevocation !== 'function') throw problem('POC_REVOCATION_STEP_REQUIRED');
  const active = () => {
    if (config.expires <= now()) throw problem('POC_TOKEN_EXPIRED_INCONCLUSIVE');
  };
  const call = async (operation, method) => {
    active();
    try {
      const response = await request(
        `${config.origin}/api/external/connections/${config.id}/${operation}`,
        {
          method,
          redirect: 'error',
          headers: { authorization: `Bearer ${config.token}` },
          signal: AbortSignal.timeout(60_000),
        },
      );
      active();
      return response;
    } catch (error) {
      if (error?.message === 'POC_TOKEN_EXPIRED_INCONCLUSIVE') throw error;
      throw problem('POC_REQUEST_FAILED');
    }
  };
  const json = async (response) => {
    try {
      return await response.json();
    } catch {
      throw problem('POC_RESPONSE_INVALID');
    }
  };
  const bound = await call('bind', 'POST');
  if (bound.status !== 200) throw problem('POC_BIND_FAILED');
  const ack = await json(bound);
  if (
    !sameKeys(ack, ['data', 'requestId']) ||
    !sameKeys(ack.data, ['saved']) ||
    ack.data.saved !== true
  )
    throw problem('POC_BIND_RESPONSE_INVALID');
  const read = await call('usage', 'GET');
  if (read.status !== 200) throw problem('POC_READ_FAILED');
  const data = await json(read);
  if (!sameKeys(data, ['data', 'requestId']) || !usage(data.data))
    throw problem('POC_USAGE_CONTRACT_INVALID');
  // Existing UI remains the authority for owner consent and revocation.
  await waitForRevocation();
  const after = await call('usage', 'GET');
  if (after.status !== 403 || (await json(after))?.error?.code !== 'DENIED')
    throw problem('POC_REVOCATION_NOT_CONFIRMED');
  return {
    binding: 'accepted',
    usageContract: 'valid',
    afterOwnerRevocation: 'denied',
    museCompatibility: 'not-tested',
  };
}

export async function main(env = process.env) {
  const terminal = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const result = await runExternalReadPoc(env, {
      waitForRevocation: async () => {
        await terminal.question(
          '結合・取得は成功しました。本人向け接続画面で対象を解除し「解除済み」を確認後、Enterを押してください。',
        );
      },
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const allowed = [
      'POC_CONFIGURATION_INVALID',
      'POC_REVOCATION_STEP_REQUIRED',
      'POC_TOKEN_EXPIRED_INCONCLUSIVE',
      'POC_REQUEST_FAILED',
      'POC_RESPONSE_INVALID',
      'POC_BIND_FAILED',
      'POC_BIND_RESPONSE_INVALID',
      'POC_READ_FAILED',
      'POC_USAGE_CONTRACT_INVALID',
      'POC_REVOCATION_NOT_CONFIRMED',
    ];
    process.stderr.write(`${allowed.includes(error?.message) ? error.message : 'POC_FAILED'}\n`);
    return 1;
  } finally {
    terminal.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main();
