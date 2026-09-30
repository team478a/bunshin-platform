import { describe, expect, it } from 'vitest';
import {
  applyServiceContentTerminology,
  serviceContentTerminologyKnowledge,
  serviceContentTerminologyPolicy,
} from '../src/services/service-content-terminology';

describe('service content terminology', () => {
  it('configures OVE as prohibited and ORI as its replacement only for Sennokuni Media', () => {
    const policy = serviceContentTerminologyPolicy('sennokuni-media');

    expect(policy).toMatchObject({
      rules: expect.arrayContaining([
        { forbidden: 'OVE', replacement: 'ORI' },
        { forbidden: '戦国インフルエンサー', replacement: '千ノ国メディア' },
        { forbidden: '戦国メタバース', replacement: '千ノ国メディア' },
        { forbidden: 'Discord参加', replacement: '公式LINEから参加' },
      ]),
      allowedExamples: ['戦国時代', '戦国武将', '戦国文化'],
      forbiddenUrlFragments: expect.arrayContaining(['project=sengoku-influencer', 'discord.gg']),
    });
    expect(serviceContentTerminologyPolicy('watashi-works-official')).toBeNull();
    expect(serviceContentTerminologyKnowledge(policy)[0]?.content).toContain('「OVE」は使用禁止');
  });

  it('removes an obsolete campaign URL that would create a prohibited link preview', () => {
    const policy = serviceContentTerminologyPolicy('sennokuni-media');
    const result = applyServiceContentTerminology(
      {
        body: '概要はこちら\nhttps://sengoku-ai.com/a/example?project=sengoku-influencer\n戦国時代を紹介します。',
        safeUrl: 'https://example.com/history',
      },
      policy,
    );

    expect(result).toEqual({
      body: '概要はこちら\n\n戦国時代を紹介します。',
      safeUrl: 'https://example.com/history',
    });
    expect(serviceContentTerminologyKnowledge(policy)[0]?.content).toContain(
      '旧企画リンクは使用禁止',
    );
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

  it('corrects participation text in all nested content fields without mutating stored content', () => {
    const input = {
      slides: [{ headline: '加入：Discord参加', body: 'ディスコードサーバーに参加' }],
      imageInstruction: 'discordチャンネルを開く',
      caption: 'Ｄｉｓｃｏｒｄ招待リンクから参加',
    };
    const result = applyServiceContentTerminology(
      input,
      serviceContentTerminologyPolicy('sennokuni-media'),
    );
    expect(result).toEqual({
      slides: [{ headline: '加入：公式LINEから参加', body: '公式LINEに参加' }],
      imageInstruction: '公式LINEを開く',
      caption: '公式LINEの案内から参加',
    });
    expect(input.slides[0]?.headline).toBe('加入：Discord参加');
  });

  it('removes Discord URLs before replacement and preserves the provided LINE URL', () => {
    const policy = serviceContentTerminologyPolicy('sennokuni-media');
    const result = applyServiceContentTerminology(
      {
        links: [
          'https://discord.gg/invite',
          'https://DISCORD.COM/invite/abc',
          'https://discordapp.com/channels/abc',
          'https://lin.ee/approved',
        ],
      },
      policy,
    );
    expect(result.links).toEqual(['', '', '', 'https://lin.ee/approved']);
    expect(JSON.stringify(result)).not.toContain('公式LINE.com');
  });

  it('supplies participation and visual constraints to generation knowledge', () => {
    const knowledge = serviceContentTerminologyKnowledge(
      serviceContentTerminologyPolicy('sennokuni-media'),
    )[0]?.content;
    expect(knowledge).toContain('参加窓口は公式LINE');
    expect(knowledge).toContain('チャンネル一覧を画像に描かない');
    expect(knowledge).toContain('URL・QRコード・所要時間');
  });

  it('preserves another service’s Discord community and links', () => {
    const input = { body: 'Discord参加 https://discord.gg/other' };
    expect(
      applyServiceContentTerminology(input, serviceContentTerminologyPolicy('other-service')),
    ).toBe(input);
  });
});
