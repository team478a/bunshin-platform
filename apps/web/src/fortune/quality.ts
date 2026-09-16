export type FortuneQualityLevel = 'HEALTHY' | 'WATCH' | 'ACTION_REQUIRED';

export interface FortuneQualityAssessment {
  level: FortuneQualityLevel;
  label: string;
  message: string;
  aiFallbackRate: number | null;
  failureRate: number;
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
