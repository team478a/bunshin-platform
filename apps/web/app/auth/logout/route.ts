import { NextResponse } from 'next/server';
import { requireSameOrigin } from '../../../src/auth/request-security';
import { createSupabaseServerClient } from '../../../src/auth/supabase';

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Return the same result so logout does not disclose session state.
  }
  return NextResponse.redirect(new URL('/login', request.url), 303);
}
