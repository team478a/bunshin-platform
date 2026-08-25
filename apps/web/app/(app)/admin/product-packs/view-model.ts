export function parseProductPackFacts(value: string) {
  return Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.split('=').map((part) => part.trim()))
      .filter(
        (parts): parts is [string, string] =>
          parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1]),
      ),
  );
}

export type ProductPackRuleInput = {
  type: 'REQUIRED_DISCLOSURE' | 'FORBIDDEN_EXPRESSION' | 'CONDITIONAL_EXPRESSION';
  value: string;
  condition: string | null;
};

const nonEmptyLines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export function parseProductPackRules({
  requiredDisclosures,
  forbiddenExpressions,
  conditionalExpressions,
}: {
  requiredDisclosures: string;
  forbiddenExpressions: string;
  conditionalExpressions: string;
}): ProductPackRuleInput[] {
  const required = nonEmptyLines(requiredDisclosures).map((value) => ({
    type: 'REQUIRED_DISCLOSURE' as const,
    value,
    condition: null,
  }));
  const forbidden = nonEmptyLines(forbiddenExpressions).map((value) => ({
    type: 'FORBIDDEN_EXPRESSION' as const,
    value,
    condition: null,
  }));
  const conditional = nonEmptyLines(conditionalExpressions).flatMap((line) => {
    const separator = line.indexOf('=>');
    if (separator < 1) return [];
    const condition = line.slice(0, separator).trim();
    const value = line.slice(separator + 2).trim();
    return condition && value
      ? [{ type: 'CONDITIONAL_EXPRESSION' as const, value, condition }]
      : [];
  });

  return [...required, ...forbidden, ...conditional];
}

export function parseProductPackAssets(value: string) {
  return nonEmptyLines(value).flatMap((line) => {
    const [type, label, url, usageTerms] = line.split('|').map((part) => part.trim());
    if (!type || !['IMAGE', 'VIDEO', 'DOCUMENT', 'LINK'].includes(type)) return [];
    if (!label || !url || !usageTerms) return [];
    try {
      if (new URL(url).protocol !== 'https:') return [];
    } catch {
      return [];
    }
    return [
      {
        type: type as 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LINK',
        label,
        url,
        usageTerms,
        validUntil: null,
      },
    ];
  });
}
