export function personalLearningNudgeDeliveryMessage(input: {
  generatedCopy: string | null;
  fixedCopy: string;
  learningUrl: string;
}) {
  if (!input.generatedCopy) return { text: input.fixedCopy, copySource: 'FIXED_N1' as const };
  return {
    text: `${input.generatedCopy}\n${input.learningUrl}`,
    copySource: 'AI_N2' as const,
  };
}
