import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) =>
  readFileSync(
    new URL(`../app/s/[serviceSlug]/bunshins/[bunshinId]/${file}`, import.meta.url),
    'utf8',
  );

describe('social insight recorder module boundary', () => {
  it('keeps the recorder focused on composing the form and results', () => {
    const recorder = read('social-insight-recorder.tsx');

    expect(recorder).toContain('useSocialInsightRecorder(props)');
    expect(recorder).toContain('<SocialInsightRecorderForm');
    expect(recorder).toContain('<SocialInsightRecorderResults');
    expect(recorder).not.toContain('fetch(');
    expect(recorder).not.toContain('document.createElement');
  });

  it('keeps network state, image preparation, and views in separate modules', () => {
    const controller = read('use-social-insight-recorder.ts');
    const image = read('social-insight-image.ts');
    const form = read('social-insight-recorder-form.tsx');
    const results = read('social-insight-recorder-results.tsx');

    expect(controller).toContain('fetch(`${endpoint}/extract`');
    expect(controller).toContain('fetch(mode ===');
    expect(controller).toContain('prepareSocialInsightImage');
    expect(image).toContain("document.createElement('canvas')");
    expect(form).toContain('画像の数字を読み取る');
    expect(results).toContain('buildPostPerformanceInsight');
  });
});
