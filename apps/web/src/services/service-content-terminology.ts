export interface ServiceContentTerminologyRule {
  forbidden: string;
  replacement: string;
}

export interface ServiceContentTerminologyPolicy {
  rules: ServiceContentTerminologyRule[];
  allowedExamples?: string[];
  forbiddenUrlFragments?: string[];
  forbiddenHostnames?: string[];
  participationInstructions?: string[];
}

const SERVICE_CONTENT_TERMINOLOGY_POLICIES: Readonly<
  Record<string, ServiceContentTerminologyPolicy>
> = {
  'sennokuni-media': {
    rules: [
      { forbidden: 'OVE', replacement: 'ORI' },
      { forbidden: '戦国インフルエンサー', replacement: '千ノ国メディア' },
      { forbidden: '戦国メタバース', replacement: '千ノ国メディア' },
      ...['Discord', 'ディスコード', 'Ｄｉｓｃｏｒｄ'].flatMap((name) => [
        { forbidden: `${name}サーバー`, replacement: '公式LINE' },
        { forbidden: `${name}チャンネル`, replacement: '公式LINE' },
        { forbidden: `${name}招待リンク`, replacement: '公式LINEの案内' },
        { forbidden: `${name}参加`, replacement: '公式LINEから参加' },
        { forbidden: name, replacement: '公式LINE' },
      ]),
    ],
    allowedExamples: ['戦国時代', '戦国武将', '戦国文化'],
    forbiddenUrlFragments: [
      'project=sengoku-influencer',
      'discord.gg',
      'discord.com',
      'discordapp.com',
    ],
    forbiddenHostnames: ['discord.gg', 'discord.com', 'discordapp.com'],
    participationInstructions: [
      '千ノ国メディアへの参加窓口は公式LINEです。参加案内は公式LINEの友だち追加・参加登録として説明してください。',
      'Discord・ディスコードへの参加や招待はありません。Discordのロゴ、画面、サーバー一覧、チャンネル一覧を画像に描かないでください。',
      'スマートフォンで参加する場面は、公式LINEでの友だち追加・参加登録を表現してください。実際の画面や操作手順を推測で作らないでください。',
      '入力資料にある別の参加先より、この参加ルールを優先してください。未提供のURL・QRコード・所要時間・登録完了の返信を創作しないでください。',
    ],
  },
};

export function serviceContentTerminologyPolicy(
  serviceSlug: string,
): ServiceContentTerminologyPolicy | null {
  return SERVICE_CONTENT_TERMINOLOGY_POLICIES[serviceSlug] ?? null;
}

export function serviceContentTerminologyKnowledge(policy: ServiceContentTerminologyPolicy | null) {
  if (!policy) return [];
  return [
    {
      type: 'SERVICE_CONTENT_TERMINOLOGY',
      title: 'サービス固有の表記ルール',
      content:
        policy.rules
          .map(
            ({ forbidden, replacement }) =>
              `「${forbidden}」は使用禁止。入力資料に含まれていても、出力では必ず「${replacement}」を使用する。`,
          )
          .join('\n') +
        (policy.allowedExamples?.length
          ? `\n${policy.allowedExamples.map((value) => `「${value}」は使用可能。`).join('')}`
          : '') +
        (policy.forbiddenUrlFragments?.length
          ? `\nURLに${policy.forbiddenUrlFragments.map((value) => `「${value}」`).join('、')}を含む旧企画リンクは使用禁止。出力へ含めない。`
          : '') +
        (policy.participationInstructions?.length
          ? `\n${policy.participationInstructions.join('\n')}`
          : ''),
    },
  ];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceTerminology(value: string, rules: ServiceContentTerminologyRule[]) {
  return rules.reduce((current, { forbidden, replacement }) => {
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9])${escapeRegExp(forbidden)}(?=$|[^A-Za-z0-9])`,
      'gi',
    );
    return current.replace(pattern, (match, prefix: string, offset: number, source: string) => {
      const start = offset + prefix.length;
      const before = source.slice(0, start);
      const after = source.slice(start + forbidden.length);
      if (/[A-Za-z0-9-]+\.$/u.test(before) || /^\.[A-Za-z0-9-]+(?:[./:?#]|$)/u.test(after))
        return match;
      return `${prefix}${replacement}`;
    });
  }, value);
}

function removeForbiddenUrls(value: string, fragments: string[], hostnames: string[]) {
  if (fragments.length === 0 && hostnames.length === 0) return value;
  const forbiddenHost = (hostname: string) =>
    hostnames.some((blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`));
  const otherFragments = fragments.filter((fragment) => !hostnames.includes(fragment));
  return value
    .replace(/(?:https?:)?\/\/[^\s<>"'）)]+/giu, (url) => {
      const normalized = url.toLocaleLowerCase('en-US');
      let hostname = '';
      try {
        hostname = new URL(url.startsWith('//') ? `https:${url}` : url).hostname
          .toLowerCase()
          .replace(/\.$/u, '');
      } catch {
        return hostnames.some((blocked) => normalized.includes(blocked)) ||
          otherFragments.some((fragment) => normalized.includes(fragment.toLowerCase()))
          ? ''
          : url;
      }
      return forbiddenHost(hostname) ||
        otherFragments.some((fragment) => normalized.includes(fragment.toLowerCase()))
        ? ''
        : url;
    })
    .replace(
      /(?<![A-Za-z0-9@._/-])(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?::\d{1,5})?(?:[/?#][A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*)?/giu,
      (url) => (forbiddenHost(url.split(/[/:?#]/u)[0]!.toLowerCase()) ? '' : url),
    )
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim();
}

function applyTerminologyToValue(
  value: unknown,
  policy: ServiceContentTerminologyPolicy | null,
): unknown {
  if (!policy) return value;
  if (typeof value === 'string') {
    return replaceTerminology(
      removeForbiddenUrls(
        value,
        policy.forbiddenUrlFragments ?? [],
        policy.forbiddenHostnames ?? [],
      ),
      policy.rules,
    );
  }
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    return items.map((item) => applyTerminologyToValue(item, policy));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        applyTerminologyToValue(item, policy),
      ]),
    );
  }
  return value;
}

export function applyServiceContentTerminology<T>(
  value: T,
  policy: ServiceContentTerminologyPolicy | null,
): T {
  return applyTerminologyToValue(value, policy) as T;
}
