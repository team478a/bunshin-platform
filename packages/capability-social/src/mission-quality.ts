import type { SelectedBunshinMemory } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

import {
  assertPlatformFormat,
  missionInteger,
  missionString,
  normalizeMissionContent,
  strict,
  type MissionContent,
} from './mission-content';
import type { MissionContentGeneratorInput } from './mission-content-generation';
import type {
  DailyMissionBrief,
  DailyMissionPlannerInput,
  DailyMissionPlannerProviderInput,
  MissionBusinessProfileContext,
  MissionPersonalizationContext,
} from './mission-generation';
import type { SocialPlatform } from './social-profile';

export interface MissionQualityCheckerInput {
  platform: SocialPlatform;
  brief: DailyMissionBrief;
  content: MissionContent;
  bunshin: DailyMissionPlannerInput['bunshin'];
  approvedStrategy: DailyMissionPlannerProviderInput['approvedStrategy'];
  businessProfile?: MissionBusinessProfileContext | null;
  selectedMemories: SelectedBunshinMemory[];
  groupKnowledge?: MissionContentGeneratorInput['groupKnowledge'];
  recentContent?: Array<{
    missionDate: string;
    topic: string;
    angle: string;
    contentExcerpt: string;
  }>;
  personalization?: MissionPersonalizationContext;
}

export interface MissionQualityCheckerProviderInput extends Omit<
  MissionQualityCheckerInput,
  'brief' | 'selectedMemories'
> {
  brief: Pick<
    DailyMissionBrief,
    | 'missionDate'
    | 'format'
    | 'topic'
    | 'angle'
    | 'reason'
    | 'estimatedMinutes'
    | 'personalizationSourceTypes'
    | 'personalizationReason'
  >;
  selectedMemories: Array<Omit<SelectedBunshinMemory, 'id'>>;
}

export const MISSION_QUALITY_VERDICTS = ['PASS', 'REVISE', 'REJECT'] as const;
export type MissionQualityVerdict = (typeof MISSION_QUALITY_VERDICTS)[number];
export const MISSION_QUALITY_SEVERITIES = ['WARNING', 'ERROR'] as const;
export type MissionQualitySeverity = (typeof MISSION_QUALITY_SEVERITIES)[number];
export interface MissionQualityIssue {
  code: string;
  severity: MissionQualitySeverity;
  field: string;
  message: string;
  repairInstruction: string;
}
export interface MissionQualityCheckerOutput {
  verdict: MissionQualityVerdict;
  score: number;
  issues: MissionQualityIssue[];
}

export interface MissionQualityCheckerResult {
  output: MissionQualityCheckerOutput;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export interface MissionQualityCheckerPort {
  check(input: MissionQualityCheckerProviderInput): Promise<MissionQualityCheckerResult>;
}

const carouselComparableText = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[\s、。！？!?,.・「」『』（）()【】]/gu, '')
    .toLowerCase();

const deterministicImageCarouselIssues = (content: MissionContent): MissionQualityIssue[] => {
  const slides = content['slides'];
  if (!Array.isArray(slides) || slides.length !== 5) return [];
  const issues: MissionQualityIssue[] = [];
  const seenMessages = new Set<string>();
  const seenScenes = new Set<string>();
  for (const [index, rawSlide] of slides.entries()) {
    if (!rawSlide || typeof rawSlide !== 'object') continue;
    const slide = rawSlide as Record<string, unknown>;
    const headline = typeof slide['headline'] === 'string' ? slide['headline'].trim() : '';
    const body = typeof slide['body'] === 'string' ? slide['body'].trim() : '';
    const visualScene = typeof slide['visualScene'] === 'string' ? slide['visualScene'].trim() : '';
    const page = index + 1;
    if (Array.from(headline).length > 20) {
      issues.push({
        code: 'CAROUSEL_TEXT_TOO_LONG',
        severity: 'ERROR',
        field: `slides.${index}.headline`,
        message: `${page}枚目の見出しが画像内で省略されます。`,
        repairInstruction: `${page}枚目の見出しを、意味を変えず20文字以内のやさしい日本語にする。`,
      });
    }
    const bodyLimit = index === 0 ? 24 : 72;
    if (Array.from(body).length > bodyLimit) {
      issues.push({
        code: 'CAROUSEL_TEXT_TOO_LONG',
        severity: 'ERROR',
        field: `slides.${index}.body`,
        message: `${page}枚目の本文が画像内で省略されます。`,
        repairInstruction: `${page}枚目の本文を、要点を残して${bodyLimit}文字以内のやさしい日本語にする。`,
      });
    }
    const messageKey = carouselComparableText(`${headline}${body}`);
    if (messageKey && seenMessages.has(messageKey)) {
      issues.push({
        code: 'CAROUSEL_DUPLICATE_MESSAGE',
        severity: 'ERROR',
        field: `slides.${index}`,
        message: `${page}枚目が前のページと同じ内容です。`,
        repairInstruction: `${page}枚目をその役割だけの新しい情報に直し、前ページの言い換えにしない。`,
      });
    }
    seenMessages.add(messageKey);
    const sceneKey = carouselComparableText(visualScene);
    if (sceneKey && seenScenes.has(sceneKey)) {
      issues.push({
        code: 'REPEATED_VISUAL_SCENE',
        severity: 'ERROR',
        field: `slides.${index}.visualScene`,
        message: `${page}枚目の写真構成が前のページと重複しています。`,
        repairInstruction: `${page}枚目は内容に合う別の動作、カメラ角度、小物、背景を具体的に指定する。`,
      });
    }
    seenScenes.add(sceneKey);
  }
  const cta = slides[4] as Record<string, unknown>;
  const ctaHeadline = typeof cta?.['headline'] === 'string' ? cta['headline'] : '';
  const ctaBody = typeof cta?.['body'] === 'string' ? cta['body'] : '';
  const ctaText = `${ctaHeadline}${ctaBody}`;
  if (
    !/(保存|試|確認|選|書|作|始|相談|予約|登録|タップ|見返|送|答|コメント|フォロー|プロフィール)/u.test(
      ctaText,
    )
  ) {
    issues.push({
      code: 'CAROUSEL_NO_ACTION',
      severity: 'ERROR',
      field: 'slides.4',
      message: '最後のページで読者が次にすることが分かりません。',
      repairInstruction:
        '5枚目に、保存する・今日一つ試す・コメントするなど、読者が今すぐできる行動を一つだけ明記する。',
    });
  }
  return issues.slice(0, 10);
};

export class CheckMissionQuality {
  constructor(private readonly checker: MissionQualityCheckerPort) {}

  async execute(input: MissionQualityCheckerInput) {
    assertPlatformFormat(input.platform, input.brief.format);
    const content = normalizeMissionContent(input.brief.format, input.content);
    const {
      missionDate,
      format,
      topic,
      angle,
      reason,
      estimatedMinutes,
      personalizationSourceTypes,
      personalizationReason,
    } = input.brief;
    const selectedMemories = input.selectedMemories.map(
      ({ type, summary, content, selectionReason }) => ({
        type,
        summary,
        content,
        selectionReason,
      }),
    );
    const result = await this.checker.check({
      ...input,
      brief: {
        missionDate,
        format,
        topic,
        angle,
        reason,
        estimatedMinutes,
        ...(personalizationSourceTypes && personalizationReason
          ? { personalizationSourceTypes, personalizationReason }
          : {}),
      },
      content,
      selectedMemories,
    });
    const score = missionInteger(result.output.score, 0, 100, 'quality score');
    if (!Array.isArray(result.output.issues) || result.output.issues.length > 10)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid quality issues');
    const providerIssues = result.output.issues.map((value) => {
      const issue = strict(
        value,
        ['code', 'severity', 'field', 'message', 'repairInstruction'],
        'quality issue',
      );
      const severity = missionString(issue['severity'], 20, 'quality severity');
      if (!MISSION_QUALITY_SEVERITIES.includes(severity as MissionQualitySeverity))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid quality severity');
      return {
        code: missionString(issue['code'], 80, 'quality issue code'),
        severity: severity as MissionQualitySeverity,
        field: missionString(issue['field'], 100, 'quality issue field'),
        message: missionString(issue['message'], 500, 'quality issue message'),
        repairInstruction: missionString(
          issue['repairInstruction'],
          500,
          'quality repair instruction',
        ),
      };
    });
    if (!MISSION_QUALITY_VERDICTS.includes(result.output.verdict))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid quality verdict');
    const deterministicIssues =
      input.brief.format === 'IMAGE' ? deterministicImageCarouselIssues(content) : [];
    const issues = [...deterministicIssues, ...providerIssues]
      .filter(
        (issue, index, values) =>
          values.findIndex(
            (candidate) => candidate.code === issue.code && candidate.field === issue.field,
          ) === index,
      )
      .slice(0, 10);
    const deterministicVerdict = deterministicIssues.length > 0 ? 'REVISE' : 'PASS';
    const verdict =
      score < 70
        ? 'REJECT'
        : result.output.verdict === 'REJECT'
          ? 'REJECT'
          : result.output.verdict === 'REVISE' || deterministicVerdict === 'REVISE'
            ? 'REVISE'
            : 'PASS';
    return {
      ...result,
      output: {
        verdict,
        score: deterministicIssues.length > 0 ? Math.min(score, 84) : score,
        issues,
      },
    };
  }
}
