import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  isCustomFortuneCardCode,
  isStandardFortuneCard,
  parseFortuneKnowledgePack,
  readFortuneDeck,
  TAROT_DECK,
  type FortuneDeckCard,
} from '@bunshin/capability-fortune';
import { ApplicationError } from '@bunshin/shared';
import type { FortuneDeckChange } from './deck-settings';
import { publishFortuneKnowledge } from './knowledge-operations';
import { fortuneOperatorScope } from './operator-scope';

export async function saveFortuneDeckCard(input: {
  serviceSlug: string;
  actorUserId: string;
  expectedVersion: number;
  change: FortuneDeckChange;
}) {
  const service = await fortuneOperatorScope(input.serviceSlug, input.actorUserId);
  const { prisma } = await import('@bunshin/database');
  return prisma.$transaction(async (tx) => {
    const [setting] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM fortune_service_settings
      WHERE workspace_id = ${service.workspaceId}::uuid AND group_id = ${service.serviceId}::uuid
        AND configuration_id = ${service.configuration.id}::uuid FOR UPDATE`;
    if (!setting) throw new ApplicationError('NOT_FOUND', '占い設定が見つかりません。');
    const previous = await tx.fortuneKnowledgeVersion.findFirst({
      where: { serviceSettingId: setting.id, status: 'APPROVED' },
      orderBy: { version: 'desc' },
      select: {
        version: true,
        promptVersion: true,
        deck: true,
        cardMeanings: {
          where: { safetyReviewed: true },
          select: {
            cardCode: true,
            orientation: true,
            theme: true,
            title: true,
            body: true,
            actionStep: true,
          },
        },
      },
    });
    if (!previous || previous.version !== input.expectedVersion)
      throw new ApplicationError(
        'CONFLICT',
        'カード設定が更新されています。画面を読み直してください。',
      );
    const change = input.change;
    const existingDeck = readFortuneDeck(previous.deck);
    const code = change.code ?? `CUSTOM_${randomUUID().replaceAll('-', '').toUpperCase()}`;
    let card: FortuneDeckCard | null;
    if (change.kind === 'standard') {
      const standard = TAROT_DECK.find((item) => item.code === code);
      if (!standard) throw new ApplicationError('NOT_FOUND', '標準カードが見つかりません。');
      card = change.imageUrl
        ? { code, nameJa: standard.nameJa, imageUrl: change.imageUrl, enabled: true }
        : null;
    } else {
      if (
        change.code &&
        (!isCustomFortuneCardCode(code) || !existingDeck.some((item) => item.code === code))
      )
        throw new ApplicationError('NOT_FOUND', 'このサービスのカードが見つかりません。');
      card = { code, nameJa: change.nameJa, imageUrl: change.imageUrl, enabled: change.enabled };
    }
    const deck = existingDeck.filter((item) => item.code !== code);
    if (card) deck.push(card);
    const meanings =
      change.kind === 'custom'
        ? [
            ...previous.cardMeanings.filter((item) => item.cardCode !== code),
            ...change.meanings.map((meaning) => ({ ...meaning, cardCode: code })),
          ]
        : previous.cardMeanings;
    const pack = parseFortuneKnowledgePack({ promptVersion: previous.promptVersion, meanings }, [
      ...TAROT_DECK.map((item) => item.code),
      ...deck.filter((item) => !isStandardFortuneCard(item.code)).map((item) => item.code),
    ]);
    const version = await publishFortuneKnowledge(tx, setting.id, input.actorUserId, pack, deck);
    return { saved: true, code, version };
  });
}
