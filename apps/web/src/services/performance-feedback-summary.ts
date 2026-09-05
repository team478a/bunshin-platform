export function buildPerformanceFeedbackSummary(input: {
  posted: number;
  good: number;
  neutral: number;
  bad: number;
}) {
  const rated = input.good + input.neutral + input.bad;
  const unrated = Math.max(0, input.posted - rated);
  const coveragePercent = input.posted === 0 ? 0 : Math.round((rated / input.posted) * 100);
  return {
    ...input,
    rated,
    unrated,
    coveragePercent,
    needsAttention: input.posted >= 3 && coveragePercent < 60,
  };
}
