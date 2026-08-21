import { AcceptRequiredLegalConsents } from '@bunshin/application';
import { NextResponse } from 'next/server';
import { currentUserProvider } from '../../../src/auth/current-user';
import { requireSameOrigin } from '../../../src/auth/request-security';

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) return NextResponse.redirect(new URL('/login', request.url), 303);
    const values = (await request.formData()).getAll('documentId');
    if (values.some((value) => typeof value !== 'string')) throw new Error('invalid consent');
    const db = await import('@bunshin/database');
    await new AcceptRequiredLegalConsents(new db.PrismaLegalConsentRepository()).execute({
      userId: user.userId,
      documentIds: values as string[],
    });
    return NextResponse.redirect(new URL('/bunshins', request.url), 303);
  } catch {
    return NextResponse.redirect(new URL('/consent?error=1', request.url), 303);
  }
}
