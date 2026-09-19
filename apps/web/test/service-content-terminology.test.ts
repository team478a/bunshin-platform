import { describe, expect, it } from 'vitest';
import {
  applyServiceContentTerminology,
  serviceContentTerminologyKnowledge,
  serviceContentTerminologyPolicy,
} from '../src/services/service-content-terminology';

describe('service content terminology', () => {
  it('configures OVE as prohibited and ORI as its replacement only for Sennokuni Media', () => {
    const policy = serviceContentTerminologyPolicy('sennokuni-media');

    expect(policy).toEqual({ rules: [{ forbidden: 'OVE', replacement: 'ORI' }] });
    expect(serviceContentTerminologyPolicy('watashi-works-official')).toBeNull();
    expect(serviceContentTerminologyKnowledge(policy)[0]?.content).toContain('「OVE」は使用禁止');
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
