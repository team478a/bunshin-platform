import {
  applyServiceContentTerminology,
  serviceContentTerminologyPolicy,
} from '../../../../src/services/service-content-terminology';

export type DailyMissionView = {
  id: string;
  missionDate: string;
  status: 'GENERATED' | 'VIEWED' | 'STARTED' | 'COMPLETED' | 'SKIPPED' | 'EXPIRED';
  format: 'TEXT' | 'SLIDE' | 'IMAGE' | 'LIVE_ACTION' | 'AI_VIDEO_PROMPT';
  assistanceLevel: ContentAssistanceLevel;
  estimatedMinutes: number;
  topic: string;
  angle: string;
  reason: string;
  campaignId: string | null;
  classification: 'ORGANIC' | 'PRODUCT_RELATED' | 'ADVERTISEMENT';
  qualityScore: number | null;
  content: Record<string, unknown>;
  decision: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  rejectionReason: string | null;
  platform: 'INSTAGRAM' | 'TIKTOK' | 'X' | 'THREADS' | 'YOUTUBE_SHORTS' | 'OTHER' | null;
  postedAt: string | null;
  feedback: 'GOOD' | 'NEUTRAL' | 'BAD' | null;
  executionResult?:
    | 'EXECUTION_COMPLETED'
    | 'EXECUTION_PARTIAL'
    | 'EXECUTION_NOT_COMPLETED'
    | 'EXECUTION_HELP_NEEDED'
    | null;
  businessAction?: {
    kind:
      | 'POST'
      | 'PHOTO'
      | 'COMMENT_REPLY'
      | 'CUSTOMER_QUESTION'
      | 'PROFILE_IMPROVEMENT'
      | 'RESULT_REVIEW'
      | 'REST';
    label: string;
    title: string;
    reason: string;
    steps: string[];
    postContentIsPrimary: boolean;
    program?: {
      cycleNumber: number;
      day: number;
      phaseKey: 'FOUNDATION' | 'START_POSTING' | 'BUILD_RESPONSE' | 'ESTABLISH_PATTERN';
      phaseLabel: string;
    };
  };
  businessOutcomes?: {
    inquiries: number;
    reservations: number;
    visits: number;
    repeatReservations: number;
    repeatVisits: number;
    orders: number;
    other: number;
  };
  strategyGoal?:
    | 'FOLLOWERS'
    | 'LINE_REGISTRATION'
    | 'INQUIRY'
    | 'VISIT_RESERVATION'
    | 'SALES'
    | 'RECRUIT'
    | 'REPEAT'
    | 'BRAND_AWARENESS'
    | 'TRUST_EXPERTISE'
    | 'BLOG_TRAFFIC'
    | 'OTHER'
    | null;
  goalOutcome?: {
    strategyGoal: NonNullable<DailyMissionView['strategyGoal']>;
    result: 'ACHIEVED' | 'SOME_PROGRESS' | 'NO_CHANGE' | 'UNKNOWN';
    reportedAt: string;
  } | null;
  trendContext: {
    whyNow: string;
    fitReason: string;
  } | null;
  externalLinkUsage?: {
    linkName: string;
    insertedUrl: string;
    expiresAt: string | null;
    productName: string;
    campaignName: string | null;
    advertisingClassification: 'ORGANIC' | 'PRODUCT_RELATED' | 'ADVERTISEMENT';
  } | null;
  copyAuthorization?: {
    allowed: boolean;
    reason: string;
    reviewNote?: string | null;
  };
  variants: Array<{
    id: string;
    sequence: number;
    content: Record<string, unknown>;
    qualityScore: number;
    selectedAt: string | null;
  }>;
};

export type ContentAssistanceLevel = 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE';

export const missionAssistanceOptions = [
  { value: 'IDEA_ONLY', label: '企画を見る', help: 'テーマと、伝えるポイントを確認します。' },
  { value: 'GUIDED', label: '作り方を見る', help: '作る順番や進め方も確認します。' },
  { value: 'READY_TO_USE', label: '完成版を見る', help: 'そのまま使える文章や台本を確認します。' },
] as const satisfies ReadonlyArray<{
  value: ContentAssistanceLevel;
  label: string;
  help: string;
}>;

export const platformLabels: Record<NonNullable<DailyMissionView['platform']>, string> = {
  INSTAGRAM: 'インスタグラム',
  TIKTOK: 'ティックトック',
  X: 'X（旧ツイッター）',
  THREADS: 'スレッズ',
  YOUTUBE_SHORTS: 'ユーチューブ ショート',
  OTHER: 'その他',
};

function text(value: unknown) {
  return typeof value === 'string' ? value : null;
}
function records(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}
function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function missionGuide(mission: DailyMissionView) {
  const content = mission.content;
  if (mission.format === 'TEXT') {
    const parts = strings(content['threadParts']);
    return [
      '最初に、読む人が気になるひと言を書きます。',
      parts.length > 0
        ? `次に、話を${parts.length + 1}つに分けて順番に伝えます。`
        : '次に、いちばん伝えたいことを分かりやすく説明します。',
      text(content['cta'])
        ? '最後に、読んだ人にしてほしいことを伝えます。'
        : '最後に、短いまとめを書きます。',
    ];
  }
  if (mission.format === 'SLIDE') {
    return records(content['slides']).map((slide, index) => {
      const headline = text(slide['headline']);
      return `${index + 1}枚目${headline ? `「${headline}」` : ''}を作ります。`;
    });
  }
  if (mission.format === 'LIVE_ACTION') {
    const instruction = text(content['shootingInstruction']);
    const scenes = records(content['script']);
    return [
      ...(instruction ? [instruction] : []),
      scenes.length > 0
        ? `${scenes.length}つの場面に分けて、上から順番に撮ります。`
        : '最初・説明・まとめの順番で撮ります。',
    ];
  }
  if (mission.format === 'AI_VIDEO_PROMPT') {
    return [
      '最初に、動画で伝えたいことを1つに決めます。',
      '次に、場面の順番と動画の雰囲気を決めます。',
      '最後に、完成版の指示文を動画を作るAIへ入れます。',
    ];
  }
  return [
    '最初に、画像でいちばん伝えたいことを決めます。',
    '次に、色・配置・画像の中に入れる文字を決めます。',
    '最後に、完成版の指示文を画像を作るAIや制作サービスへ入れます。',
  ];
}

export function MissionIdea({ mission }: { mission: DailyMissionView }) {
  return (
    <div className="mission-assistance-content">
      <h4>今日の企画</h4>
      <p>
        <strong>テーマ：</strong>
        {mission.topic}
      </p>
      <p>
        <strong>伝え方：</strong>
        {mission.angle}
      </p>
      <p>
        <strong>この企画にした理由：</strong>
        {mission.reason}
      </p>
    </div>
  );
}

export function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(date);
}

export function MissionTrendContext({ mission }: { mission: DailyMissionView }) {
  const context = mission.trendContext;
  if (!context) return null;
  return (
    <aside className="mission-trend-context" aria-label="この企画で参考にした新しい情報">
      <h4>新しい情報も参考にしました</h4>
      <p>調べた情報をそのまま写さず、あなたに合う企画にしています。</p>
      <dl>
        <div>
          <dt>今おすすめする理由</dt>
          <dd>{context.whyNow}</dd>
        </div>
        <div>
          <dt>あなたに合う理由</dt>
          <dd>{context.fitReason}</dd>
        </div>
      </dl>
    </aside>
  );
}

export function MissionGuide({ mission }: { mission: DailyMissionView }) {
  return (
    <div className="mission-assistance-content">
      <h4>作り方</h4>
      <ol>
        {missionGuide(mission).map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

export function MissionContent({ mission }: { mission: DailyMissionView }) {
  const content = mission.content;
  if (mission.format === 'TEXT') {
    return (
      <div>
        <p>{text(content['body'])}</p>
        {strings(content['threadParts']).map((part, index) => (
          <p key={index}>{part}</p>
        ))}
        {text(content['cta']) && <p>CTA: {text(content['cta'])}</p>}
        {strings(content['hashtags']).length > 0 && (
          <p>ハッシュタグ: {strings(content['hashtags']).join(' ')}</p>
        )}
        {text(content['photoInstruction']) && (
          <p>写真の撮り方: {text(content['photoInstruction'])}</p>
        )}
      </div>
    );
  }
  if (mission.format === 'SLIDE') {
    return (
      <ol>
        {records(content['slides']).map((slide, index) => (
          <li key={index}>
            <strong>{text(slide['headline'])}</strong>
            <p>{text(slide['body'])}</p>
          </li>
        ))}
      </ol>
    );
  }
  if (mission.format === 'LIVE_ACTION') {
    return (
      <div>
        <p>撮影指示: {text(content['shootingInstruction'])}</p>
        <ol>
          {records(content['script']).map((part, index) => (
            <li key={index}>
              {text(part['seconds'])}: {text(part['text'])}
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (mission.format === 'AI_VIDEO_PROMPT') {
    return (
      <div>
        <p>AI動画を作るための説明：</p>
        <p>{text(content['prompt'])}</p>
        {text(content['caption']) && <p>投稿文: {text(content['caption'])}</p>}
      </div>
    );
  }
  return (
    <div>
      <p>画像制作指示: {text(content['imageInstruction'])}</p>
      {text(content['overlayText']) && <p>画像内テキスト: {text(content['overlayText'])}</p>}
      <p>投稿文: {text(content['caption'])}</p>
    </div>
  );
}

export const rejectionReasons = [
  ['NOT_MY_STYLE', '自分らしくない'],
  ['WRONG_TOPIC', '話題が違う'],
  ['TOO_DIFFICULT', '難しすぎる'],
  ['TOO_MUCH_WORK', '作業が多すぎる'],
  ['SIMILAR_TO_PAST', '過去と似ている'],
  ['TOO_SALESY', '売り込み感が強い'],
  ['NOT_TODAY', '今日は違う'],
] as const;

function serviceCopyMission(mission: DailyMissionView, serviceSlug?: string): DailyMissionView {
  const policy = serviceSlug ? serviceContentTerminologyPolicy(serviceSlug) : null;
  return {
    ...mission,
    ...applyServiceContentTerminology(
      { topic: mission.topic, angle: mission.angle, content: mission.content },
      policy,
    ),
  };
}

export function imagePostHeadline(mission: DailyMissionView, serviceSlug?: string) {
  mission = serviceCopyMission(mission, serviceSlug);
  const firstSlide = records(mission.content['slides'])[0];
  return (
    text(mission.content['overlayText']) ??
    (firstSlide ? text(firstSlide['headline']) : null) ??
    mission.topic
  );
}

const imageSlidePlan = [
  {
    role: '表紙',
    headline: null,
    body: '投稿テーマと切り口がすぐ伝わる短い導入文',
    scene: 'テーマが一目で分かる完成イメージと主役を大きく見せる',
  },
  {
    role: '悩み・共感',
    headline: 'その悩み、あなただけではありません',
    body: '読者の悩みを責めずに受け止める短い共感文',
    scene: '対象読者が困っている具体的な場面を、表情や手元の動きで見せる',
  },
  {
    role: '理由・気づき',
    headline: '理由を知ると、見方が変わる',
    body: '投稿文と切り口の範囲で理由や気づきを伝える短い説明',
    scene: '原因や違いを比較・図解・小物の配置で分かりやすく見せる',
  },
  {
    role: '今日できる解決策',
    headline: '今日できる小さな一歩',
    body: '読者が今日試せる具体的な行動を一つ伝える短い文',
    scene: '解決策を実際に行っている手順や動作を近くから見せる',
  },
  {
    role: 'まとめ・次の行動',
    headline: 'まずは一つ、試してみましょう',
    body: '要点を短くまとめ、無理のない次の行動を促す文',
    scene: '実行後の良い状態と、保存・次の行動につながる余白を見せる',
  },
] as const;

export type ImageInstructionSlide = {
  slideIndex: number;
  role: string;
  headline: string;
  prompt: string;
};

export function imageCreationSlidePrompts(
  mission: DailyMissionView,
  serviceSlug?: string,
): ImageInstructionSlide[] {
  mission = serviceCopyMission(mission, serviceSlug);
  const instruction = text(mission.content['imageInstruction']);
  const headline = imagePostHeadline(mission);
  const caption = text(mission.content['caption']);
  const slides = records(mission.content['slides']);
  const captionSource = caption ? `投稿文：${caption}` : null;
  const policyInstructions = serviceSlug
    ? (serviceContentTerminologyPolicy(serviceSlug)?.participationInstructions ?? [])
    : [];
  return imageSlidePlan.map((page, index) => {
    const saved = slides[index];
    const pageHeadline =
      text(saved?.['headline']) ?? (index === 0 ? headline : (page.headline ?? headline));
    const pageBody = text(saved?.['body']) ?? page.body;
    const pageScene =
      text(saved?.['visualScene']) ?? (instruction ? `${instruction}。${page.scene}` : page.scene);
    const lines = [
      `縦長4:5（1080×1350ピクセル）のSNS投稿画像を1枚だけ作ってください。複数枚・コマ割り・一覧にはしないでください。`,
      `この画像は5枚シリーズの${index + 1}枚目（${page.role}）です。`,
      ...(index > 0
        ? [
            'この会話で作った前の画像と同じ人物・色・書体・レイアウトで、このページだけを1枚作ってください',
          ]
        : [
            'この1枚目で人物・色・書体・レイアウトを決め、後続ページでも統一できるデザインにしてください。',
          ]),
      `投稿のテーマ：${mission.topic}`,
      `このページの見出し：「${pageHeadline}」`,
      `このページの本文：「${pageBody}」`,
      `このページの場面・構図：${pageScene}`,
      `本文が不足している場合は、${page.role}の役割に沿って投稿文・切り口の範囲で短く補ってください。新しい事実や根拠のない数字は加えないでください。`,
      captionSource,
      `投稿の切り口：${mission.angle}`,
      '人物・色・書体・レイアウト・余白をシリーズ内で統一してください。',
      '見出しは短く大きく、本文は読みやすい2〜4行にし、文字の周囲に十分な余白を取ってください。',
      '背景と文字の色に十分な差をつけ、スマートフォンでも文字が読みやすいデザインにしてください。',
      '日本語を一字一句正確に表示してください。ロゴ、透かし、意味不明な文字は入れないでください。',
      ...policyInstructions,
    ];
    return {
      slideIndex: index + 1,
      role: page.role,
      headline: pageHeadline,
      prompt: lines.filter((line): line is string => line !== null).join('\n'),
    };
  });
}

export function imageCreationPrompt(
  mission: DailyMissionView,
  serviceSlug?: string,
  slideIndex?: number,
) {
  const slides = imageCreationSlidePrompts(mission, serviceSlug);
  if (slideIndex !== undefined)
    return slides.find((slide) => slide.slideIndex === slideIndex)?.prompt ?? '';
  return slides.map(({ prompt }) => prompt).join('\n\n--- 次の画像 ---\n\n');
}

export function copyOptions(mission: DailyMissionView, serviceSlug?: string) {
  mission = serviceCopyMission(mission, serviceSlug);
  const content = mission.content;
  const caption = text(content['caption']);
  if (mission.format === 'TEXT') {
    const hashtags = strings(content['hashtags']).join(' ');
    const value = [
      text(content['body']),
      ...strings(content['threadParts']),
      text(content['cta']),
      hashtags || null,
    ]
      .filter(Boolean)
      .join('\n\n');
    return value ? [{ label: '投稿文をコピー', value, type: 'COPIED_TEXT' as const }] : [];
  }
  if (mission.format === 'SLIDE') {
    const imageSlides = imageCreationSlidePrompts(mission, serviceSlug);
    const slides = records(content['slides']).map((slide, index) => ({
      label: `${index + 1}枚目をコピー`,
      value: [text(slide['headline']), text(slide['body'])].filter(Boolean).join('\n'),
      type: 'COPIED_SLIDE' as const,
      metadata: { slideIndex: index + 1 },
    }));
    const all = slides
      .map(({ value }) => value)
      .filter(Boolean)
      .join('\n\n---\n\n');
    return [
      ...imageSlides.map((slide) => ({
        label: `${slide.slideIndex}枚目をコピー`,
        role: slide.role,
        headline: slide.headline,
        value: slide.prompt,
        type: 'COPIED_IMAGE_INSTRUCTION' as const,
        metadata: { slideIndex: slide.slideIndex },
      })),
      {
        label: '5枚まとめてコピー',
        value: imageCreationPrompt(mission, serviceSlug),
        type: 'COPIED_IMAGE_INSTRUCTION' as const,
        metadata: { slideIndex: 0 },
        advanced: true,
      },
      ...(caption
        ? [{ label: '投稿文をコピー', value: caption, type: 'COPIED_TEXT' as const }]
        : []),
      ...(all ? [{ label: '全部コピー', value: all, type: 'COPIED_SLIDE' as const }] : []),
      ...slides,
    ];
  }
  if (mission.format === 'AI_VIDEO_PROMPT') {
    return [
      {
        label: 'AI動画を作るための説明をコピー',
        value: text(content['prompt']),
        type: 'COPIED_VIDEO_PROMPT' as const,
      },
      { label: '投稿文をコピー', value: caption, type: 'COPIED_TEXT' as const },
    ].filter((item): item is typeof item & { value: string } => item.value !== null);
  }
  if (mission.format === 'LIVE_ACTION') {
    const script = records(content['script'])
      .map((part) => `${text(part['seconds']) ?? ''}: ${text(part['text']) ?? ''}`)
      .join('\n');
    return [
      { label: '撮影台本をコピー', value: script || null, type: 'COPIED_SCRIPT' as const },
      { label: '投稿文をコピー', value: caption, type: 'COPIED_TEXT' as const },
    ].filter((item): item is typeof item & { value: string } => item.value !== null);
  }
  return [
    ...imageCreationSlidePrompts(mission, serviceSlug).map((slide) => ({
      label: `${slide.slideIndex}枚目をコピー`,
      role: slide.role,
      headline: slide.headline,
      value: slide.prompt,
      type: 'COPIED_IMAGE_INSTRUCTION' as const,
      metadata: { slideIndex: slide.slideIndex },
    })),
    {
      label: '5枚まとめてコピー',
      value: imageCreationPrompt(mission, serviceSlug),
      type: 'COPIED_IMAGE_INSTRUCTION' as const,
      metadata: { slideIndex: 0 },
      advanced: true,
    },
    { label: '投稿文をコピー', value: caption, type: 'COPIED_TEXT' as const },
  ].filter((item): item is typeof item & { value: string } => item.value !== null);
}

export function selectedMissionVariant(mission: DailyMissionView) {
  return mission.variants
    .filter(({ selectedAt }) => selectedAt !== null)
    .sort((left, right) => right.selectedAt!.localeCompare(left.selectedAt!))[0];
}

export function missionWithSelectedVariant(mission: DailyMissionView): DailyMissionView {
  const selected = selectedMissionVariant(mission);
  return selected ? { ...mission, content: selected.content } : mission;
}
