import { describe, expect, it, vi } from 'vitest';
import { VercelCustomDomainProvider } from '../src/services/vercel-custom-domain';

function provider(fetchImpl: typeof fetch) {
  return new VercelCustomDomainProvider({
    token: 'secret-token',
    projectId: 'project-1',
    teamId: 'team-1',
    fetchImpl,
  });
}

describe('VercelCustomDomainProvider', () => {
  it('registers a missing domain and returns the DNS challenge', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({
          name: 'service.example.com',
          verified: false,
          verification: [{ type: 'TXT', domain: '_vercel.example.com', value: 'verify-me' }],
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 400 }))
      .mockResolvedValueOnce(
        Response.json({
          verified: false,
          verification: [{ type: 'TXT', domain: '_vercel.example.com', value: 'verify-me' }],
        }),
      );

    await expect(provider(fetchImpl).synchronize('service.example.com')).resolves.toEqual({
      status: 'DRAFT',
      note: expect.stringContaining('TXT / _vercel.example.com / verify-me'),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls[1]?.[0]).toBeInstanceOf(URL);
    expect((fetchImpl.mock.calls[1]?.[0] as URL).searchParams.get('teamId')).toBe('team-1');
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ name: 'service.example.com' }),
    });
  });

  it('activates a verified and configured domain', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ name: 'service.example.com', verified: true }))
      .mockResolvedValueOnce(Response.json({ misconfigured: false }));
    await expect(provider(fetchImpl).synchronize('service.example.com')).resolves.toEqual({
      status: 'ACTIVE',
      note: 'Vercelでドメイン接続とSSLの準備を確認しました。',
    });
  });

  it('keeps a verified domain unpublished while its DNS target is incorrect', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ name: 'service.example.com', verified: true }))
      .mockResolvedValueOnce(
        Response.json({
          misconfigured: true,
          recommendedCNAME: [{ value: 'cname.vercel-dns-0.com' }],
        }),
      );
    await expect(provider(fetchImpl).synchronize('service.example.com')).resolves.toMatchObject({
      status: 'VERIFIED',
      note: expect.stringContaining('cname.vercel-dns-0.com'),
    });
  });
});
