import { describe, expect, it } from 'vitest';
import {
  applyServiceContentTerminology,
  serviceContentTerminologyKnowledge,
  serviceContentTerminologyPolicy,
} from '../src/services/service-content-terminology';

describe('service content terminology', () => {
  it('configures OVE as prohibited and ORI as its replacement only for Sennokuni Media', () => {
    const policy = serviceContentTerminologyPolicy('sennokuni-media');

    expect(policy).toEqual({
      rules: [
        { forbidden: 'OVE', replacement: 'ORI' },
        { forbidden: '戦国インフルエンサー', replacement: '千ノ国メディア' },
        { forbidden: '戦国メタバース', replacement: '千ノ国メディア' },
      ],
      allowedExamples: ['戦国時代', '戦国武将', '戦国文化'],
    });
    expect(serviceContentTerminologyPolicy('watashi-works-official')).toBeNull();
    expect(serviceContentTerminologyKnowledge(policy)[0]?.content).toContain('「OVE」は使用禁止');
  });

  it('blocks obsolete Sennokuni product names without blocking historical expressions', () => {
    const policy = serviceContentTerminologyPolicy('sennokuni-media');
    const result = applyServiceContentTerminology(
      {
        title: '戦国インフルエンサーの活動',
        body: '戦国メタバースで戦国時代や戦国武将の魅力を伝えます。',
        linkLabel: '戦国文化について詳しく見る',
      },
      policy,
    );

    expect(result).toEqual({
      title: '千ノ国メディアの活動',
      body: '千ノ国メディアで戦国時代や戦国武将の魅力を伝えます。',
      linkLabel: '戦国文化について詳しく見る',
    });
    expect(serviceContentTerminologyKnowledge(policy)[0]?.content).toContain(
      '「戦国時代」は使用可能',
    );
  });

  it('removes the prohibited standalone term from every generated text field', () => {
    const policy = serviceContentTerminologyPolicy('sennokuni-media');
    const result = applyServiceContentTerminology(
      {
        body: 'OVEを使わず、oveではなくORIと表記します。LOVEは別の単語です。',
        slides: [{ headline: 'OVE のご案内', body: '正しい名称はORI' }],
      },
      policy,
    );

    expect(result).toEqual({
      body: 'ORIを使わず、ORIではなくORIと表記します。LOVEは別の単語です。',
      slides: [{ headline: 'ORI のご案内', body: '正しい名称はORI' }],
    });
  });

  it('does not alter content when the service has no terminology policy', () => {
    const input = { body: 'OVEの案内' };
    expect(applyServiceContentTerminology(input, null)).toBe(input);
  });
});
