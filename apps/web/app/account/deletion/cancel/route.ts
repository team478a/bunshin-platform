import { CancelAccountDeletion } from '@bunshin/application';
import { NextResponse } from 'next/server';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { requireSameOrigin } from '../../../../src/auth/request-security';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) return NextResponse.redirect(new URL('/login', request.url), 303);
    const db = await import('@bunshin/database');
    await new CancelAccountDeletion(new db.PrismaAccountDeletionRequestRepository()).execute(
      user.userId,
    );
    return NextResponse.redirect(new URL('/account', request.url), 303);
  } catch {
    return NextResponse.redirect(new URL('/account?error=1', request.url), 303);
  }
}
