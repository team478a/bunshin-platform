import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (name: string) =>
  readFileSync(new URL(`../app/s/[serviceSlug]/manage/points/${name}`, import.meta.url), 'utf8');

describe('points operations module boundary', () => {
  it('keeps the operations facade focused on composing sections', () => {
    const facade = source('points-operations-sections.tsx');

    expect(facade).toContain('<PointsOverviewSections');
    expect(facade).toContain('<PointsRuleSections');
    expect(facade).toContain('<PointsAdjustmentSections');
    expect(facade).not.toContain('<section');
    expect(facade).not.toContain("from './actions'");
  });

  it('keeps participant balances and redemptions in the overview section', () => {
    const overview = source('points-overview-sections.tsx');

    expect(overview).toContain('ポイント付与の一括停止');
    expect(overview).toContain('最近のポイント交換');
    expect(overview).toContain('参加者のポイント・バッジ状況');
  });

  it('separates rule configuration from manual balance adjustments', () => {
    const rules = source('points-rule-sections.tsx');
    const adjustments = source('points-adjustment-sections.tsx');

    expect(rules).toContain('ポイントのため方を設定');
    expect(rules).toContain('募集ごとのポイントを設定');
    expect(rules).toContain('ポイントの使い道を設定');
    expect(rules).not.toContain('randomUUID');
    expect(adjustments).toContain('参加者へボーナスを付与');
    expect(adjustments).toContain('誤付与ポイントを回収');
    expect(adjustments).toContain('最近の変更履歴');
  });
});
