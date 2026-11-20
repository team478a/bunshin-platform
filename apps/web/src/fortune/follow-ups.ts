import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import { OpenAiFortuneReadingGenerator } from '../providers/openai-fortune-reading-generator';

export async function fortuneFollowUpRepository() {
  const db = await import('@bunshin/database');
  return new db.PrismaFortuneFollowUpRepository(db.prisma);
}

export async function askFortuneFollowUp(input: {
  serviceSlug: string;
  actorUserId: string;
  readingId: string;
  requestId: string;
  question: string;
}) {
  const repository = await fortuneFollowUpRepository();
  const reservation = await repository.reserve(input);
  if (reservation.kind === 'REPLAY') return reservation.view;
  if (reservation.kind === 'LIMIT')
    throw new ApplicationError('CONFLICT', 'この鑑定の追加質問の上限に達しました。');
  if (reservation.kind === 'UNAVAILABLE')
    throw new ApplicationError('NOT_FOUND', '追加質問を利用できません。');
  const context = { ...input, revision: reservation.claim.personalProfileRevision };
  const output = await new OpenAiFortuneReadingGenerator()
    .generate({
      actorUserId: input.actorUserId,
      serviceSlug: input.serviceSlug,
      claim: reservation.claim,
      followUp: { requestId: input.requestId, question: input.question, prior: reservation.prior },
      assertAllowed: async () => {
        if (!(await repository.allowed(context)))
          throw new ApplicationError('FORBIDDEN', '追加質問の利用条件が変わりました。');
      },
    })
    .catch(() => null);
  const result = await repository.complete({ ...context, output });
  if (!result) throw new ApplicationError('NOT_FOUND', '追加質問を利用できません。');
  return result;
}
