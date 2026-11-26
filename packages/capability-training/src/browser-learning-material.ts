type LearningIntent = 'knowledge' | 'research' | 'practice' | 'combined';

export function classifyLearningIntent(text: string): LearningIntent {
  const practice = /操作|手順|入力|クリック|試したい|練習|プレビュー/.test(text);
  const research = /調べ|比較|最新|検索|調査/.test(text);
  const knowledge = /仕組み|理由|とは|基礎/.test(text);
  if (practice && (research || knowledge)) return 'combined';
  if (practice) return 'practice';
  return research ? 'research' : 'knowledge';
}

export function browserLearningTarget(request: {
  originalText: string;
  deviceType: string | null;
}) {
  const text = request.originalText.normalize('NFKC');
  const device =
    request.deviceType === 'SMARTPHONE'
      ? ('mobile' as const)
      : request.deviceType === 'PC' || request.deviceType === 'BOTH'
        ? ('desktop' as const)
        : null;
  if (!device) return null;
  if (
    /(?:検証用|練習用)(?:の)?研修申請フォーム/.test(text) &&
    /入力|チェック|確認|プレビュー|操作|手順|使い方/.test(text)
  )
    return { kind: 'form' as const, device };
  if (
    /研修用カタログ|操作練習用カタログ/.test(text) &&
    /比較.{0,12}(表示|開[くき]|確認|見たい|手順|操作|したい)/.test(text)
  )
    return { kind: 'catalogue' as const, device };
  const intent = classifyLearningIntent(text);
  if (
    (intent !== 'practice' && intent !== 'combined') ||
    !/練習用メモ|操作練習.{0,12}メモ/.test(text) ||
    !/プレビュー/.test(text)
  )
    return null;
  return { kind: 'practice-note' as const, device };
}

export function browserLearningDevice(request: Parameters<typeof browserLearningTarget>[0]) {
  return browserLearningTarget(request)?.device ?? null;
}
