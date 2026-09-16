export type FortuneQualityLevel = 'HEALTHY' | 'WATCH' | 'ACTION_REQUIRED';

export interface FortuneQualityAssessment {
  level: FortuneQualityLevel;
  label: string;
  message: string;
  aiFallbackRate: number | null;
  failureRate: number;
}

export interface FortuneAiOperationsSummary {
  monthKey: string;
  commercialStatus: string | null;
  generationLimit: number | null;
  consumedGenerations: number;
  processingGenerations: number;
  successfulCalls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  pricedCalls: number;
  unpricedCalls: number;
  estimatedCostUsdMicros: number;
}

export function summarizeFortuneAiOperations(input: {
  monthKey: string;
  commercialStatus: string | null;
  generationLimit: number | null;
  consumedGenerations: number;
  processingGenerations: number;
  usage: Array<{
    status: 'SUCCESS' | 'FAILED';
    inputTokens: number | null;
    outputTokens: number | null;
    estimatedCostUsdMicros: bigint | number | null;
  }>;
}): FortuneAiOperationsSummary {
  return {
    monthKey: input.monthKey,
    commercialStatus: input.commercialStatus,
    generationLimit: input.generationLimit,
    consumedGenerations: input.consumedGenerations,
    processingGenerations: input.processingGenerations,
    successfulCalls: input.usage.filter((row) => row.status === 'SUCCESS').length,
    failedCalls: input.usage.filter((row) => row.status === 'FAILED').length,
    inputTokens: input.usage.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0),
    outputTokens: input.usage.reduce((sum, row) => sum + (row.outputTokens ?? 0), 0),
    pricedCalls: input.usage.filter((row) => row.estimatedCostUsdMicros !== null).length,
    unpricedCalls: input.usage.filter((row) => row.estimatedCostUsdMicros === null).length,
    estimatedCostUsdMicros: input.usage.reduce(
      (sum, row) => sum + Number(row.estimatedCostUsdMicros ?? 0),
      0,
    ),
  };
}

export function assessFortuneQuality(input: {
  aiEnabled: boolean;
  aiReadingCount: number;
  basicReadingCount: number;
  failedReadingCount: number;
  staleGeneratingCount: number;
}): FortuneQualityAssessment {
  const completed = input.aiReadingCount + input.basicReadingCount;
  const attempted = completed + input.failedReadingCount;
  const aiFallbackRate =
    input.aiEnabled && completed > 0 ? input.basicReadingCount / completed : null;
  const failureRate = attempted > 0 ? input.failedReadingCount / attempted : 0;

  if (
    input.staleGeneratingCount > 0 ||
    failureRate >= 0.1 ||
    (aiFallbackRate !== null && aiFallbackRate >= 0.5)
  )
    return {
      level: 'ACTION_REQUIRED',
      label: '確認が必要です',
      message:
        '生成が止まっているか、失敗・標準文への切り替えが多いため、AI接続を確認してください。',
      aiFallbackRate,
      failureRate,
    };

  if (input.failedReadingCount > 0 || (aiFallbackRate !== null && aiFallbackRate >= 0.2))
    return {
      level: 'WATCH',
      label: '経過を確認してください',
      message:
        '利用者には結果を表示できていますが、一部で失敗または標準文への切り替えがありました。',
      aiFallbackRate,
      failureRate,
    };

  return {
    level: 'HEALTHY',
    label: '正常です',
    message: '現在、運営者の対応が必要な問題は見つかっていません。',
    aiFallbackRate,
    failureRate,
  };
}

export function fortuneFailureLabel(code: string): string {
  if (code === 'AI_OUTPUT_REJECTED') return '安全確認により標準文へ切り替え';
  if (code === 'AI_GENERATION_FAILED') return 'AI生成に失敗して標準文へ切り替え';
  return '生成処理を完了できませんでした';
}
