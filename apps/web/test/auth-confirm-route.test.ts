import { describe, expect, it } from 'vitest';
import { GET } from '../app/auth/confirm/route';

describe('magic link confirmation route', () => {
  it('moves a valid token to the explicit confirmation screen', () => {
    const response = GET(
      new Request('https://bunshin.example/auth/confirm?token_hash=abc_123-Z&type=email'),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'https://bunshin.example/login/confirm?token_hash=abc_123-Z&type=email',
    );
  });

  it('rejects missing or malformed magic-link parameters', () => {
    const response = GET(
      new Request('https://bunshin.example/auth/confirm?token_hash=%3Cscript%3E&type=email'),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://bunshin.example/login?error=1');
  });
});
