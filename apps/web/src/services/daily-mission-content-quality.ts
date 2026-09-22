import type { MissionContent } from '@bunshin/capability-social';
import { simhashSimilarityBasisPoints } from '@bunshin/application';
import { campaignContentSignature } from './campaign-content-signature';

export interface RecentDailyMissionContent {
  id?: string;
  missionDate: string;
  topic: string;
  angle: string;
  content: MissionContent | null;
}

export type DailyMissionContentIssueCode =
  'INSTRUCTION_AS_POST' | 'EXACT_RECENT_CONTENT' | 'SUBSTANTIAL_RECENT_OVERLAP';

export interface DailyMissionContentIssue {
  code: DailyMissionContentIssueCode;
  message: string;
  recentMissionDate?: string;
}

const instructionPatterns = [
  /(?:質問|疑問).{0,24}(?:一つ|1つ).{0,16}(?:選び|選んで).{0,16}(?:答える|回答する)/u,
  /(?:理由|価値観|出来事|変化|場面).{0,30}(?:一つ|1つ).{0,16}(?:紹介する|伝える|説明する)/u,
  /今日は[「『].+(?:という切り口で伝える|を紹介する)[」』]をご紹介します/u,
] as const;

export function missionContentText(content: MissionContent): string {
  const values: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === 'string') values.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(content);
  return values.join('\n');
}

function substantiveMissionContentText(content: MissionContent): string {
  if ('body' in content && typeof content.body === 'string') return content.body;
  if ('slides' in content && Array.isArray(content.slides))
    return content.slides
      .flatMap((slide): unknown[] => {
        if (!slide || typeof slide !== 'object') return [];
        const value = slide as Record<string, unknown>;
        return [value['headline'], value['body']];
      })
      .filter((value): value is string => typeof value === 'string')
      .join('\n');
  if ('script' in content && Array.isArray(content.script))
    return content.script
      .map((part): unknown =>
        part && typeof part === 'object' ? (part as Record<string, unknown>)['text'] : null,
      )
      .filter((value): value is string => typeof value === 'string')
      .join('\n');
  if ('caption' in content && typeof content.caption === 'string') return content.caption;
  if ('prompt' in content && typeof content.prompt === 'string') return content.prompt;
  return missionContentText(content);
}

const comparableText = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/gu, '')
    .replace(/#[\p{L}\p{N}_ー]+/gu, '')
    .replace(/[\s\p{P}\p{S}]/gu, '');

const shingles = (value: string, size = 4) => {
  const normalized = comparableText(value);
  const result = new Set<string>();
  if (normalized.length <= size) {
    if (normalized) result.add(normalized);
    return result;
  }
  for (let index = 0; index <= normalized.length - size; index += 1)
    result.add(normalized.slice(index, index + size));
  return result;
};

export function contentOverlapBasisPoints(left: string, right: string): number {
  const a = shingles(left);
  const b = shingles(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return Math.round((intersection * 10_000) / Math.min(a.size, b.size));
}

export function inspectDailyMissionContent(input: {
  content: MissionContent;
  recentMissions: RecentDailyMissionContent[];
}): DailyMissionContentIssue | null {
  const text = substantiveMissionContentText(input.content);
  if (instructionPatterns.some((pattern) => pattern.test(text)))
    return {
      code: 'INSTRUCTION_AS_POST',
      message: '投稿の作成指示が、完成した投稿本文として含まれています。',
    };

  const candidate = campaignContentSignature(input.content);
  for (const recent of input.recentMissions) {
    if (!recent.content) continue;
    const previous = campaignContentSignature(recent.content);
    if (candidate.contentFingerprint === previous.contentFingerprint)
      return {
        code: 'EXACT_RECENT_CONTENT',
        message: '本人へ提示済みの原稿と同一です。',
        recentMissionDate: recent.missionDate,
      };
    const overlap = contentOverlapBasisPoints(text, substantiveMissionContentText(recent.content));
    const simhash = simhashSimilarityBasisPoints(candidate.simhash, previous.simhash);
    // Two independent signals are required. This avoids treating a shared service name or CTA as
    // a duplicate while still rejecting a fixed body whose date, heading or emoji alone changed.
    if ((overlap >= 7_200 && simhash >= 8_000) || overlap >= 8_000)
      return {
        code: 'SUBSTANTIAL_RECENT_OVERLAP',
        message: '本人へ提示済みの原稿と、伝えている具体的な内容がほぼ同じです。',
        recentMissionDate: recent.missionDate,
      };
  }
  return null;
}

export function recentMissionQualityContext(recentMissions: RecentDailyMissionContent[]) {
  return recentMissions
    .filter(
      (mission): mission is RecentDailyMissionContent & { content: MissionContent } =>
        mission.content !== null,
    )
    .slice(-14)
    .map((mission) => ({
      missionDate: mission.missionDate,
      topic: mission.topic,
      angle: mission.angle,
      contentExcerpt: missionContentText(mission.content).slice(0, 1_200),
    }));
}
