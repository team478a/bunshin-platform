export function learnerTrainingProgramName(serviceSlug: string, programName: string) {
  return serviceSlug === 'manaberu-style' && programName === 'マナベルスタイル Personal Learning'
    ? 'あなたのAI研修'
    : programName;
}
