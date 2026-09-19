export interface ServiceContentTerminologyRule {
  forbidden: string;
  replacement: string;
}

export interface ServiceContentTerminologyPolicy {
  rules: ServiceContentTerminologyRule[];
}

const SERVICE_CONTENT_TERMINOLOGY_POLICIES: Readonly<
  Record<string, ServiceContentTerminologyPolicy>
> = {
  'sennokuni-media': {
    rules: [{ forbidden: 'OVE', replacement: 'ORI' }],
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
      content: policy.rules
        .map(
          ({ forbidden, replacement }) =>
            `「${forbidden}」は使用禁止。入力資料に含まれていても、出力では必ず「${replacement}」を使用する。`,
        )
        .join('\n'),
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
    return current.replace(pattern, (_match, prefix: string) => `${prefix}${replacement}`);
  }, value);
}

function applyTerminologyToValue(
  value: unknown,
  policy: ServiceContentTerminologyPolicy | null,
): unknown {
  if (!policy) return value;
  if (typeof value === 'string') return replaceTerminology(value, policy.rules);
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
