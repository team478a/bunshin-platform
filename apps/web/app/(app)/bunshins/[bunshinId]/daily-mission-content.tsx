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
    orders: number;
    other: number;
  };
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

export function imagePostHeadline(mission: DailyMissionView) {
  const firstSlide = records(mission.content['slides'])[0];
  return (
    text(mission.content['overlayText']) ??
    (firstSlide ? text(firstSlide['headline']) : null) ??
    mission.topic
  );
}

export function imageCreationPrompt(mission: DailyMissionView) {
  const instruction = text(mission.content['imageInstruction']);
  const headline = imagePostHeadline(mission);
  const caption = text(mission.content['caption']);
  const fallbackScenes = [
    '表紙としてテーマが一目で分かる完成イメージと主役を大きく見せる',
    '対象読者が困っている具体的な場面を、表情や手元の動きで見せる',
    '原因や違いを、比較・図解・小物の配置で分かりやすく見せる',
    '解決策を実際に行っている手順や動作を近くから見せる',
    '実行後の良い状態と、保存・次の行動につながる余白を見せる',
  ];
  const preparedSlides = records(mission.content['slides']).flatMap((slide, index) => {
    const slideHeadline = text(slide['headline']);
    const body = text(slide['body']);
    const visualScene = text(slide['visualScene']) ?? fallbackScenes[index % fallbackScenes.length];
    return slideHeadline && body
      ? [
          `${index + 1}枚目：見出し「${slideHeadline}」／本文「${body}」／このページの場面「${visualScene}」`,
        ]
      : [];
  });
  const contentPlan = preparedSlides.length
    ? [
        '5枚に入れる文章：',
        ...preparedSlides,
        ...(preparedSlides.length < 5
          ? [
              '不足するページは投稿テーマと投稿文だけを材料にして、5枚で完結するよう補ってください。',
            ]
          : []),
      ]
    : [
        '次の流れで、5枚だけで内容が完結する短い文章を作り、各画像に入れてください。',
        `1枚目（表紙）：見出し「${headline}」で興味を引く`,
        '2枚目（共感）：読者が「自分のことだ」と思える悩みを示す',
        '3枚目（気づき）：悩みが起きる理由や大切な考え方を伝える',
        '4枚目（解決）：今日すぐできる具体的な行動を1つ伝える',
        '5枚目（まとめ）：要点を短くまとめ、保存や実行をやさしく促す',
        caption ? `内容を作る材料となる投稿文：${caption}` : null,
        `内容を作る材料となる切り口：${mission.angle}`,
      ];
  const lines = [
    'Instagramにそのまま投稿できる、5枚で完結する投稿画像を作ってください。',
    '5枚はそれぞれ縦長4:5（1080×1350ピクセル）の別画像として作ってください。1枚の画像に5コマを並べないでください。',
    `投稿のテーマ：${mission.topic}`,
    '1枚目だけを見ても、何について誰に役立つ投稿か分かる表紙にしてください。',
    instruction ? `写真・イラストの内容：${instruction}` : null,
    ...contentPlan,
    '見出しは短く大きく、本文は2〜4行にしてください。日本語は一字一句正確に表示してください。',
    '5枚すべてで人物と色・書体・余白を統一し、連続したシリーズにしてください。',
    '各ページは指定した場面に合わせて、構図・動作・小物・背景の見せ方を変えてください。同じ写真や、ほぼ同じ構図を繰り返さないでください。',
    '背景と文字の色に十分な差をつけ、文字の周囲に余白を取ってください。',
    '人物や写真だけで終わらせず、見出し・本文と写真やイラストを組み合わせたSNS投稿デザインに仕上げてください。',
    'ロゴ、透かし、意味不明な文字は入れないでください。',
    '一度に1枚しか生成できない場合は、まず1枚目を作り、私が「次」と送るたびに同じデザインで2枚目から順番に作ってください。',
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}

export function copyOptions(mission: DailyMissionView) {
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
      {
        label: '5枚の画像を作る文章をコピー',
        value: imageCreationPrompt(mission),
        type: 'COPIED_IMAGE_INSTRUCTION' as const,
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
    {
      label: '画像を作るための説明をコピー',
      value: imageCreationPrompt(mission),
      type: 'COPIED_IMAGE_INSTRUCTION' as const,
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
