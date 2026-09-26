import { describe, expect, it } from 'vitest';
import {
  businessProfileKnowledgeForPrompt,
  executionResultKnowledgeForPrompt,
  industrySafetyKnowledgeForPrompt,
} from '../src/services/service-generation-knowledge';
import { readFileSync } from 'node:fs';

const resultPersistenceSource = readFileSync(
  new URL('../src/services/daily-mission-result-persistence.ts', import.meta.url),
  'utf8',
);

describe('service business profile generation context', () => {
  it('builds scoped business facts for the generation prompt', () => {
    expect(
      businessProfileKnowledgeForPrompt({
        industryKey: 'FOOD',
        industryName: '飲食',
        otherIndustryText: null,
        businessName: 'テスト食堂',
        region: '東京',
        productService: '日替わり定食',
        primaryPurpose: 'ATTRACT',
        targetAudience: '近隣で働く人',
        websiteUrl: 'https://example.jp',
        businessFeatures: '毎朝仕込む日替わり定食',
        priceInformation: '税込900円',
        preferredTone: 'やさしく親しみやすい',
        requiredContent: '予約不要',
        forbiddenContent: '地域最安',
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'SERVICE_BUSINESS_PROFILE',
          content: expect.stringContaining('業種: 飲食'),
        }),
      ]),
    );
    const [knowledge] = businessProfileKnowledgeForPrompt({
      industryKey: 'FOOD',
      industryName: '飲食',
      otherIndustryText: null,
      businessName: 'テスト食堂',
      region: '東京',
      productService: '日替わり定食',
      primaryPurpose: 'ATTRACT',
      targetAudience: '近隣で働く人',
      websiteUrl: 'https://example.jp',
      businessFeatures: '毎朝仕込む日替わり定食',
      priceInformation: '税込900円',
      preferredTone: 'やさしく親しみやすい',
      requiredContent: '予約不要',
      forbiddenContent: '地域最安',
    });
    expect(knowledge?.content).toContain('特徴・選ばれる理由: 毎朝仕込む日替わり定食');
    expect(knowledge?.content).toContain('使わない内容・表現: 地域最安');
  });

  it('adds stricter rules for regulated industries', () => {
    expect(industrySafetyKnowledgeForPrompt('HEALTHCARE').content).toContain(
      '診断、治療、予防効果を断定しない',
    );
    expect(industrySafetyKnowledgeForPrompt('FOOD').content).toContain('効果を保証せず');
  });

  it('uses the service or enrolled program delivery level when saving a mission', () => {
    expect(resultPersistenceSource).toContain(
      'serviceKnowledge?.contentAssistanceLevel ?? profile.defaultAssistanceLevel',
    );
  });

  it('turns the latest execution result into a concrete next-action adjustment', () => {
    const knowledge = executionResultKnowledgeForPrompt([
      {
        type: 'EXECUTION_HELP_NEEDED',
        missionDate: '2026-09-15',
        topic: 'お客様の質問へ返信する',
      },
      {
        type: 'EXECUTION_PARTIAL',
        missionDate: '2026-09-14',
        topic: '店内写真を1枚撮る',
      },
    ]);

    expect(knowledge).toMatchObject({
      type: 'SERVICE_RECENT_EXECUTION_RESULTS',
      title: '最近の実行結果',
    });
    expect(knowledge?.content).toContain('やり方が分からなかった');
    expect(knowledge?.content).toContain('スマートフォンで迷わずできる一つの操作');
  });
});
