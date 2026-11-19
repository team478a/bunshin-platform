import 'server-only';

export async function fortunePersonalProfileRepository() {
  const db = await import('@bunshin/database');
  return new db.PrismaFortunePersonalProfileRepository(db.prisma);
}
