import 'server-only';
import { DEFAULT_ACTIVITY_CONTINUITY_RULE } from '@bunshin/application';
import { currentLineEnvironment } from './line/secure-configuration';

export async function currentActivityContinuityRule() {
  const environment = currentLineEnvironment();
  const db = await import('@bunshin/database');
  return (
    (await new db.PrismaActivityContinuityRuleRepository().active(environment)) ?? {
      ...DEFAULT_ACTIVITY_CONTINUITY_RULE,
      environment,
    }
  );
}
