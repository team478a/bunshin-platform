import 'server-only';
import { randomInt } from 'node:crypto';
import { FortuneDailyReadingService } from '@bunshin/capability-fortune';
import { OpenAiFortuneReadingGenerator } from '../providers/openai-fortune-reading-generator';

export async function fortuneDailyReadingService() {
  const db = await import('@bunshin/database');
  return new FortuneDailyReadingService(
    new db.PrismaFortuneRepository(db.prisma),
    {
      nextInt: (maxExclusive) => randomInt(maxExclusive),
    },
    new OpenAiFortuneReadingGenerator(),
  );
}
