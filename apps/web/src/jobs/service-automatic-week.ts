import 'server-only';
import { ConfirmWeeklyPlan } from '@bunshin/capability-social';
import { createWeeklyPlanGenerationService } from '../services/weekly-plan-generation';
import { loadServiceGenerationKnowledge } from '../services/service-generation-knowledge';

export function mondayForDate(localDate: string) {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export async function prepareServiceAutomaticWeek(input: {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
  groupId: string;
  weekStartDate: string;
  usageIdempotencyKey: string;
}) {
  const db = await import('@bunshin/database');
  const knowledge = await loadServiceGenerationKnowledge(input);
  const { plan } = await (
    await createWeeklyPlanGenerationService()
  ).execute({
    ...input,
    existingPolicy: 'RETURN',
    includeGrantedKnowledge: false,
    includeCampaigns: true,
    additionalKnowledge: knowledge.officialKnowledge,
  });
  return plan.status === 'CONFIRMED'
    ? plan
    : new ConfirmWeeklyPlan(
        new db.PrismaWeeklyPlanRepository(),
        new db.PrismaBunshinCapabilityAssignmentRepository(),
      ).execute({ ...input, weeklyPlanId: plan.id });
}
