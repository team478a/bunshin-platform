import { describe, expect, it } from 'vitest';
import {
  assistanceLevelLabel,
  assistanceOptions,
} from '../app/(app)/bunshins/[bunshinId]/social-profile-section';

describe('投稿支援レベルの初期設定UI', () => {
  it('shows three concrete choices in plain Japanese', () => {
    expect(assistanceOptions.map(({ label }) => label)).toEqual([
      '企画だけ教えてほしい',
      '作り方も教えてほしい',
      'そのまま使えるものを作ってほしい',
    ]);
    expect(assistanceOptions).toHaveLength(3);
    expect(assistanceOptions.every(({ description, example }) => description && example)).toBe(
      true,
    );
  });

  it('recommends only the ready-to-use choice', () => {
    expect(assistanceOptions.filter(({ recommended }) => recommended)).toEqual([
      expect.objectContaining({ value: 'READY_TO_USE' }),
    ]);
    expect(assistanceLevelLabel('GUIDED')).toBe('作り方も教えてほしい');
  });
});
