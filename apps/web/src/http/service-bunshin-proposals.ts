import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { fallbackBunshinProposals } from './bunshin-proposals';
import { OpenAIBunshinProposalGenerator } from '../providers/openai-bunshin-proposal-generator';
import { resolvePublicServiceContext } from '../services/public-service';
import {
  readServiceOnboardingAnswers,
  serviceOnboardingProposalContext,
} from '../services/service-onboarding-response';

export async function serviceBunshinProposalsResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolvePublicServiceContext(serviceSlug);
    const db = await import('@bunshin/database');
    const membership = await db.prisma.groupMembership.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        userId: actor.userId,
        status: 'ACTIVE',
        group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      },
      select: {
        serviceOnboardingResponse: { select: { answers: true } },
      },
    });
    if (!membership) throw new ApplicationError('NOT_FOUND', 'service membership not found');
    const answers = readServiceOnboardingAnswers(membership.serviceOnboardingResponse?.answers);
    if (answers.length === 0) {
      throw new ApplicationError('VALIDATION_ERROR', 'service onboarding response required');
    }
    const context = serviceOnboardingProposalContext(answers);
    const input = {
      goal: `次の初回回答に合う発信目的を設計してください。\n${context}`,
      audience: '初回回答から、投稿を届けたい相手を具体化してください。',
      tone: '初心者にも使いやすく、誇張せず、本人の回答を尊重してください。',
    };
    let proposals = fallbackBunshinProposals(input);
    let source: 'AI' | 'FALLBACK' = 'FALLBACK';
    try {
      const { apiKey, model } = await resolveOpenAiRuntimeConfiguration();
      proposals = await new OpenAIBunshinProposalGenerator({ apiKey, model }).generate(input);
      source = 'AI';
    } catch {
      // The deterministic proposals keep onboarding usable during provider outages.
    }
    proposals = proposals.map((proposal) => ({
      ...proposal,
      name: proposal.name.slice(0, 100),
      objectiveSummary: proposal.objectiveSummary.slice(0, 500),
      audienceSummary: proposal.audienceSummary.slice(0, 500),
      personalitySummary: proposal.personalitySummary.slice(0, 500),
    }));
    return Response.json(
      { data: { proposals, source }, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
