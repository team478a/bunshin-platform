import { describe, expect, it } from 'vitest';
import {
  missionContentSimilarityBasisPoints,
  prepareMissionVariantContent,
  preserveAuthorizedMissionLink,
} from '../src/services/mission-content-variant-generation';

describe('mission content variant generation safeguards', () => {
  it('detects an unchanged proposal as identical', () => {
    const content = {
      body: '今日から毎日5分だけ発信を続けます。',
      threadParts: [],
      cta: null,
      caption: null,
      hashtags: ['#発信'],
    };
    expect(missionContentSimilarityBasisPoints(content, content)).toBe(10_000);
  });

  it('removes generated URLs and restores only the authorized mission URL', () => {
    const result = preserveAuthorizedMissionLink({
      source: {
        body: '原案\n\n詳しくはこちら\nhttps://approved.example/path',
        threadParts: [],
        cta: null,
        caption: null,
        hashtags: [],
      },
      candidate: {
        body: '構成を変えた別案 https://unapproved.example/path',
        threadParts: [],
        cta: null,
        caption: null,
        hashtags: [],
      },
      insertedUrl: 'https://approved.example/path',
      platform: 'X',
    });
    expect(result['body']).toBe('構成を変えた別案\n\nhttps://approved.example/path');
    expect(JSON.stringify(result)).not.toContain('unapproved.example');
  });

  it('fails closed when the original authorized placement cannot be found', () => {
    expect(() =>
      preserveAuthorizedMissionLink({
        source: { body: 'URLなし' },
        candidate: { body: '別案' },
        insertedUrl: 'https://approved.example/path',
        platform: 'X',
      }),
    ).toThrowError('authorized link placement is unavailable');
  });

  it('keeps generated URLs out when the source mission has no authorized link', () => {
    const result = prepareMissionVariantContent({
      format: 'TEXT',
      source: {
        body: '原案',
        threadParts: [],
        cta: null,
        caption: null,
        hashtags: [],
      },
      candidate: {
        body: '別案 https://unapproved.example/path',
        threadParts: [],
        cta: null,
        caption: null,
        hashtags: [],
      },
      platform: 'X',
    });
    expect(result['body']).toBe('別案');
    expect(JSON.stringify(result)).not.toContain('https://');
  });
});
