import 'server-only';

export async function fortunePersonalProfileRepository() {
  const db = await import('@bunshin/database');
  return new db.PrismaFortunePersonalProfileRepository(db.prisma);
}

export async function fortuneUnderstandingRepository() {
  const db = await import('@bunshin/database');
  return new db.PrismaFortuneUnderstandingRepository(db.prisma);
}
