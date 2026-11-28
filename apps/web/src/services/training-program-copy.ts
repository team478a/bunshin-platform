export function learnerTrainingProgramCopy(serviceSlug: string, programName: string) {
  if (serviceSlug === 'manaberu-style') {
    switch (programName) {
      case 'マナベルスタイル AI研修30日':
        return {
          name: programName,
          description: '用意された課題に沿って、AIの使い方を30日間練習します。',
        };
      case 'マナベルスタイル Personal Learning':
        return {
          name: 'あなた専用学習プログラム',
          description: 'やりたいことや経験に合わせて、AIがあなた向けの練習を提案します。',
        };
    }
  }
  return { name: programName, description: null };
}
