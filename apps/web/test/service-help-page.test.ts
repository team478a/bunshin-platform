import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/s/[serviceSlug]/help/page.tsx', 'utf8');
const entry = readFileSync('app/s/[serviceSlug]/page.tsx', 'utf8');
const home = readFileSync('app/s/[serviceSlug]/home/page.tsx', 'utf8');
const management = readFileSync('app/s/[serviceSlug]/manage/page.tsx', 'utf8');

describe('service help page', () => {
  it('shows the configured delivery mode and explains both delivery types', () => {
    expect(source).toContain('readServiceOnboardingSettings');
    expect(source).toContain('毎日のアイデア配信：利用中');
    expect(source).toContain('毎日のアイデア配信：停止中');
    expect(source).toContain('投稿予定に基づく通常配信');
    expect(source).toContain('毎日のアイデア配信');
  });

  it('only exposes the operations manual to service staff', () => {
    expect(source).toContain("['SERVICE_OWNER', 'SERVICE_ADMIN']");
    expect(source).toContain("membership?.serviceRole === 'CONTENT_EDITOR'");
    expect(source).toContain('{(isManager || isContentEditor) && (');
  });

  it('is linked from public, member, and management pages', () => {
    expect(entry).toContain('/help');
    expect(home).toContain('/help');
    expect(management).toContain('/help');
  });
});
