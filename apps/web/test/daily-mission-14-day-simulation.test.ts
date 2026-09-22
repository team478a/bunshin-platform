import { describe, expect, it } from 'vitest';
import type { MissionContent } from '@bunshin/capability-social';
import { inspectDailyMissionContent } from '../src/services/daily-mission-content-quality';

const topics = [
  ['城跡', '石垣の角を見ると、積み直された時代の違いを探せます。'],
  ['古文書', '日付と季節の記述を照らすと、出来事が起きた頃を想像できます。'],
  ['家紋', '形を三つの要素に分けると、似た家紋を見分けやすくなります。'],
  ['街道', '宿場の間隔を地図で測ると、当時の一日の移動距離が見えてきます。'],
  ['城下町', '道が直角に曲がる場所を探すと、防御の工夫を読み取れます。'],
  ['甲冑', '札をつなぐ糸の色を見ると、武具に込めた美意識を楽しめます。'],
  ['合戦図', '人物の向きと旗印を追うと、部隊の動きを順番に確認できます。'],
  ['寺社', '棟札の年号を確かめると、建物が修理された歴史をたどれます。'],
  ['刀装具', '鍔の意匠に注目すると、持ち主が好んだ物語を考えられます。'],
  ['兵糧', '保存方法を調べると、長い行軍を支えた生活の知恵が分かります。'],
  ['書状', '宛名と署名の位置を見ると、差出人と相手の関係を推測できます。'],
  ['陣形', '地形と進行方向を一緒に見ると、その配置を選んだ理由が分かります。'],
  ['茶の湯', '道具の産地を調べると、武将同士の交流の広がりが見えてきます。'],
  ['城門', '門の正面に立ったときの視界を見ると、侵入を防ぐ仕組みを体感できます。'],
] as const;

const textContent = (profile: string, topic: string, detail: string): MissionContent => ({
  body: `${profile}さんへ。今日のテーマは${topic}です。${detail}次に資料の写真を一枚確認してみましょう。`,
  threadParts: [],
  cta: '気になった点を一つメモしてください。',
  caption: `${topic}の見方を一つ紹介します。${detail}`,
  hashtags: ['#千ノ国メディア', `#${topic}`],
  photoInstruction: `${topic}が分かる資料を、文字が読める向きで正面から撮ります。`,
});

describe('three-participant 14-day non-production simulation', () => {
  it.each(['初心者', '歴史好き', '地域ガイド'])(
    '%s receives 14 substantively distinct candidates across a week boundary',
    (profile) => {
      const history: Array<{
        missionDate: string;
        topic: string;
        angle: string;
        content: MissionContent;
      }> = [];
      for (const [index, [topic, detail]] of topics.entries()) {
        const missionDate = new Date(Date.UTC(2026, 8, 7 + index)).toISOString().slice(0, 10);
        const candidate = textContent(profile, topic, detail);
        expect(
          inspectDailyMissionContent({ content: candidate, recentMissions: history }),
        ).toBeNull();
        history.push({ missionDate, topic, angle: detail, content: candidate });
      }
      expect(history).toHaveLength(14);
      expect(history[6]?.missionDate).toBe('2026-09-13');
      expect(history[7]?.missionDate).toBe('2026-09-14');
    },
  );

  it('rejects the duplicate candidate and accepts one bounded alternate proposal', () => {
    const previous = textContent('初心者', topics[0][0], topics[0][1]);
    expect(
      inspectDailyMissionContent({
        content: previous,
        recentMissions: [
          {
            missionDate: '2026-09-07',
            topic: topics[0][0],
            angle: topics[0][1],
            content: previous,
          },
        ],
      }),
    ).not.toBeNull();
    expect(
      inspectDailyMissionContent({
        content: textContent('初心者', topics[1][0], topics[1][1]),
        recentMissions: [
          {
            missionDate: '2026-09-07',
            topic: topics[0][0],
            angle: topics[0][1],
            content: previous,
          },
        ],
      }),
    ).toBeNull();
  });
});
