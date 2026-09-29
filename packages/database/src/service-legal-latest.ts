/** 呼出側が同一Service・公開済み・有効期間で絞った文書からtype別の最大版を選ぶ。 */
export function latestServiceLegalDocuments<T extends { type: string; version: number }>(
  documents: readonly T[],
): T[] {
  const latest = new Map<string, T>();
  for (const document of documents) {
    const previous = latest.get(document.type);
    if (previous === undefined || document.version > previous.version)
      latest.set(document.type, document);
  }
  return [...latest.values()];
}
