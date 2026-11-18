import 'server-only';
import type { AiProviderRuntimeAdmission, RecordAiUsageInput } from '@bunshin/application';
import { settleProviderRuntimeAdmission } from './runtime-provider-configuration';
import { recordAiUsage, recordAiUsageSafely } from '../observability/ai-usage';

/**
 * An admitted Provider call is closed only after its canonical usage row is durable.
 * Development-only legacy runtime keeps the existing best-effort behavior because it has no
 * reservation to strand and is never available in production.
 */
export async function recordOpenAiUsageAndSettle(
  runtime: { admission: AiProviderRuntimeAdmission | null },
  usage: RecordAiUsageInput,
) {
  if (runtime.admission === null) {
    await recordAiUsageSafely(usage);
    return;
  }
  await recordAiUsage(usage);
  await settleProviderRuntimeAdmission(runtime.admission);
}

export const recordProviderUsageAndSettle = recordOpenAiUsageAndSettle;
