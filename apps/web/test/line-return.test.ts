import { describe, expect, it } from 'vitest';
import {
  imageAuthReturnSampleId,
  lineAuthReturnFromCookie,
  missionReturnPath,
  safeLineAuthReturnPath,
  videoAuthReturnProjectId,
  serviceAuthReturnSlug,
  requiresPlatformOnboarding,
  serviceAuthLoginPath,
} from '../src/auth/line-return';

describe('LINE authentication return path', () => {
  it('does not trust arbitrary service slugs supplied to a login redirect', () => {
    expect(serviceAuthLoginPath('/s/media/manage/points')).toBe(
      '/login?returnTo=%2Fs%2Fmedia%2Fmanage%2Fpoints',
    );
    expect(serviceAuthLoginPath('/s/media/../fortune/manage/points')).toBe('/login');
    expect(serviceAuthLoginPath('/s//evil.example/manage/points')).toBe('/login');
  });
  const id = '11111111-1111-4111-8111-111111111111';
  it.each(['media', 'sns-support', 'fortune', 'ai-training', 'oem'])(
    'keeps %s flows isolated',
    (slug) => {
      for (const path of [
        `/s/${slug}`,
        `/s/${slug}/home`,
        `/s/${slug}/line`,
        `/s/${slug}/onboarding`,
        `/s/${slug}/bunshins/${id}/line`,
        `/s/${slug}/programs/${id}/toolkit`,
        `/s/${slug}/manage/training/expiry`,
        `/s/${slug}/manage/training/retention`,
        `/s/${slug}/manage/training/skills`,
        `/account?service=${slug}`,
      ]) {
        expect(safeLineAuthReturnPath(path)).toBe(path);
        expect(serviceAuthReturnSlug(path)).toBe(slug);
        expect(requiresPlatformOnboarding(null, path)).toBe(false);
      }
    },
  );

  it.each([
    '/s/media/../fortune/line',
    '/s/media/%2e%2e/fortune/line',
    '/s/media/%2fhome',
    '/s/media/home?service=fortune',
    '/s/media/home#x',
    '/account?service=media&service=fortune',
    '/account?service=media&next=/admin',
    '/s/media/unknown',
    '/s/media/manage/unknown',
    '/s/media/home/extra',
    '/s/media?ref=FIRST&ref=SECOND',
    '/s/media?ref=FIRST&rc=11111111-1111-4111-8111-111111111111&rc=22222222-2222-4222-8222-222222222222',
    '/s/MEDIA/line',
    '/s/media/HOME',
    '//evil.example/s/media/line',
  ])('rejects service context aliases: %s', (path) => {
    expect(safeLineAuthReturnPath(path)).toBeNull();
    expect(serviceAuthReturnSlug(path)).toBeNull();
  });

  it('keeps platform setup separate and treats both viewers equally', () => {
    expect(requiresPlatformOnboarding(null, null)).toBe(true);
    expect(requiresPlatformOnboarding('COMPLETED', null)).toBe(false);
    expect(requiresPlatformOnboarding(null, `/image-access/${id}`)).toBe(false);
    expect(requiresPlatformOnboarding(null, `/video-access/${id}`)).toBe(false);
  });
  it('keeps the exact video viewer path through the authentication cookie', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const path = `/video-access/${id}`;
    expect(safeLineAuthReturnPath(path)).toBe(path);
    expect(videoAuthReturnProjectId(path)).toBe(id);
    expect(lineAuthReturnFromCookie(`bunshin_line_auth_return=${encodeURIComponent(path)}`)).toBe(
      path,
    );
    for (const invalid of [
      path + '/download',
      path + '?next=/admin',
      path + '#fragment',
      '/video-access/unavailable',
      'https://evil.example' + path,
    ]) {
      expect(safeLineAuthReturnPath(invalid)).toBeNull();
      expect(videoAuthReturnProjectId(invalid)).toBeNull();
    }
  });

  it('keeps an exact image viewer path through login', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    const path = `/image-access/${id}`;
    expect(safeLineAuthReturnPath(path)).toBe(path);
    expect(imageAuthReturnSampleId(path)).toBe(id);
    expect(safeLineAuthReturnPath(`${path}/download`)).toBeNull();
    expect(safeLineAuthReturnPath(`${path}?next=/admin`)).toBeNull();
  });
  it('accepts and canonicalizes only a signed Mission landing path', () => {
    expect(safeLineAuthReturnPath('/today?state=a%2Bb')).toBe('/today?state=a%2Bb');
    expect(missionReturnPath('a+b')).toBe('/today?state=a%2Bb');
  });

  it('accepts only an exact one-time Group invitation path', () => {
    const token = 'a'.repeat(43);
    expect(safeLineAuthReturnPath(`/groups/invitations/${token}`)).toBe(
      `/groups/invitations/${token}`,
    );
    expect(safeLineAuthReturnPath(`/groups/invitations/${token}?next=/admin`)).toBeNull();
    expect(safeLineAuthReturnPath(`/groups/invitations/${token}/extra`)).toBeNull();
  });

  it('accepts only an exact one-time organization invitation path', () => {
    const token = 'a'.repeat(43);
    expect(safeLineAuthReturnPath(`/organizations/invitations/${token}`)).toBe(
      `/organizations/invitations/${token}`,
    );
    expect(safeLineAuthReturnPath(`/organizations/invitations/${token}?next=/admin`)).toBeNull();
    expect(safeLineAuthReturnPath(`/organizations/invitations/${token}/extra`)).toBeNull();
  });

  it('accepts only an exact service entry path', () => {
    expect(safeLineAuthReturnPath('/s/side-job-support')).toBe('/s/side-job-support');
    expect(safeLineAuthReturnPath('/s/side-job-support?next=/admin')).toBeNull();
    expect(safeLineAuthReturnPath('/s/Bad-Slug')).toBeNull();
  });

  it('preserves only a valid Monday on a service weekly report return path', () => {
    expect(safeLineAuthReturnPath('/s/side-job-support/weekly-report?week=2026-09-07')).toBe(
      '/s/side-job-support/weekly-report?week=2026-09-07',
    );
    expect(safeLineAuthReturnPath('/s/side-job-support/weekly-report')).toBe(
      '/s/side-job-support/weekly-report',
    );
    expect(safeLineAuthReturnPath('/s/side-job-support/weekly-report?week=2026-09-08')).toBeNull();
    expect(
      safeLineAuthReturnPath('/s/side-job-support/weekly-report?week=2026-09-07&next=/admin'),
    ).toBeNull();
  });

  it('keeps only a bounded referral code and click ID on a service entry path', () => {
    const clickId = '11111111-1111-4111-8111-111111111111';
    expect(safeLineAuthReturnPath(`/s/side-job-support?ref=FRIEND2026&rc=${clickId}`)).toBe(
      `/s/side-job-support?ref=FRIEND2026&rc=${clickId}`,
    );
    expect(safeLineAuthReturnPath('/s/side-job-support?ref=bad-code')).toBeNull();
    expect(safeLineAuthReturnPath('/s/side-job-support?ref=FRIEND2026&next=/admin')).toBeNull();
  });

  it('accepts only an exact service invitation path', () => {
    const token = 'a'.repeat(43);
    expect(safeLineAuthReturnPath(`/s/side-job-support/join/${token}`)).toBe(
      `/s/side-job-support/join/${token}`,
    );
    expect(safeLineAuthReturnPath(`/s/side-job-support/join/${token}?next=/admin`)).toBeNull();
    expect(safeLineAuthReturnPath(`/s/Bad-Slug/join/${token}`)).toBeNull();
  });

  it.each([
    'https://evil.example/today?state=x',
    '//evil.example/today?state=x',
    '/today?state=x&next=https://evil.example',
    '/today?state=x#fragment',
    '/bunshins',
    '/today',
  ])('rejects an unsafe return path: %s', (value) => {
    expect(safeLineAuthReturnPath(value)).toBeNull();
  });

  it('reads a valid encoded cookie and rejects malformed values', () => {
    const value = encodeURIComponent('/today?state=opaque');
    expect(lineAuthReturnFromCookie(`other=1; bunshin_line_auth_return=${value}`)).toBe(
      '/today?state=opaque',
    );
    expect(lineAuthReturnFromCookie('bunshin_line_auth_return=%E0%A4%A')).toBeNull();
  });
});
