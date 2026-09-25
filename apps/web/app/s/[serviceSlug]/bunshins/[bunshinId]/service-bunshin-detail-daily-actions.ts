import type { DailyActionView } from './daily-action-section';
import type { PrismaClient } from '@bunshin/database';

type DatabaseModule = { prisma: PrismaClient };

const dailyActionLabels: Record<string, string> = {
  PHOTO: '今日撮った写真',
  CUSTOMER_QUESTION: 'お客様から聞かれた質問',
  VOICE_MEMO: '30秒メモ',
  COMMENT_REPLY: 'コメントへの返信',
  POST_IMPROVEMENT: '過去投稿の改善案',
  REST_REASON: '今日は投稿しない理由',
};

export async function loadServiceBunshinDailyActions(input: {
  db: DatabaseModule;
  workspaceId: string;
  groupId: string;
  bunshinId: string;
  actorUserId: string;
}): Promise<DailyActionView[]> {
  const memories = await input.db.prisma.bunshinMemory.findMany({
    where: {
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      bunshin: { ownerUserId: input.actorUserId, groupId: input.groupId },
      sourceType: 'USER_INPUT',
      sourceId: { startsWith: 'daily-action:' },
      active: true,
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return memories.flatMap((memory) => {
    const type = memory.sourceId?.split(':')[1];
    if (!type || !dailyActionLabels[type]) return [];
    return [
      {
        id: memory.id,
        type: type as DailyActionView['type'],
        text: memory.content,
        label: dailyActionLabels[type],
        hasPhoto: memory.attachmentStatus === 'READY',
        attachmentStatus: memory.attachmentStatus,
        useForAutomaticImages: memory.automaticImageReference,
        createdAt: memory.createdAt.toISOString(),
      },
    ];
  });
}
