type LearningIntent = 'knowledge' | 'research' | 'practice' | 'combined';

export function classifyLearningIntent(text: string): LearningIntent {
  const practice = /操作|手順|入力|クリック|試したい|練習|プレビュー/.test(text);
  const research = /調べ|比較|最新|検索|調査/.test(text);
  const knowledge = /仕組み|理由|とは|基礎/.test(text);
  if (practice && (research || knowledge)) return 'combined';
  if (practice) return 'practice';
  return research ? 'research' : 'knowledge';
}

export function browserLearningDevice(request: {
  originalText: string;
  deviceType: string | null;
}): 'desktop' | 'mobile' | null {
  const text = request.originalText.normalize('NFKC');
  const intent = classifyLearningIntent(text);
  if (
    (intent !== 'practice' && intent !== 'combined') ||
    !/練習用メモ|操作練習.{0,12}メモ/.test(text) ||
    !/プレビュー/.test(text)
  )
    return null;
  if (request.deviceType === 'SMARTPHONE') return 'mobile';
  if (request.deviceType === 'PC' || request.deviceType === 'BOTH') return 'desktop';
  return null;
}
