import 'server-only';
import { randomInt } from 'node:crypto';
import { FortuneDailyReadingService } from '@bunshin/capability-fortune';

export async function fortuneDailyReadingService() {
  const db = await import('@bunshin/database');
  return new FortuneDailyReadingService(new db.PrismaFortuneRepository(db.prisma), {
    nextInt: (maxExclusive) => randomInt(maxExclusive),
  });
}
