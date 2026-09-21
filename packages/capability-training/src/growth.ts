import {
  TRAINING_SKILL_KEYS,
  TRAINING_SKILL_LABELS,
  parseTrainingSkillScores,
  type TrainingSkillKey,
} from './skill-evaluation';

export type TrainingGrowthSkill = {
  key: TrainingSkillKey;
  label: string;
  score: number | null;
  status: 'MASTERED' | 'LEARNING' | 'NOT_STARTED';
};

export type TrainingGrowthSummary = {
  level: number;
  levelLabel: string;
  completedMissionCount: number;
  missionsUntilNextLevel: number | null;
  weeklyLearningDays: number;
  streak: number;
  masteredSkillCount: number;
  strongestSkill: TrainingGrowthSkill | null;
  focusSkill: TrainingGrowthSkill | null;
  skills: TrainingGrowthSkill[];
  achievements: string[];
};

const LEVEL_LABELS = [
  'はじめの一歩',
  '基礎を練習中',
  '仕事で活用中',
  '応用できる',
  '継続活用',
] as const;
const MISSIONS_PER_LEVEL = 3;

const tokyoDateKey = (value: Date) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);

export function buildTrainingGrowthSummary(input: {
  completedMissionCount: number;
  streak: number;
  skillScores: unknown;
  activityDates: readonly Date[];
  completedMissionTitles: readonly string[];
  now: Date;
}): TrainingGrowthSummary {
  const completedMissionCount = Math.max(0, Math.trunc(input.completedMissionCount));
  const level = Math.min(5, 1 + Math.floor(completedMissionCount / MISSIONS_PER_LEVEL));
  const scores = parseTrainingSkillScores(input.skillScores);
  const skills = TRAINING_SKILL_KEYS.map<TrainingGrowthSkill>((key) => {
    const score = scores[key] ?? null;
    return {
      key,
      label: TRAINING_SKILL_LABELS[key],
      score,
      status: score === null ? 'NOT_STARTED' : score >= 60 ? 'MASTERED' : 'LEARNING',
    };
  });
  const measured = skills.filter(
    (skill): skill is TrainingGrowthSkill & { score: number } => skill.score !== null,
  );
  const strongestSkill = measured.length
    ? measured.reduce((best, skill) => (skill.score > best.score ? skill : best))
    : null;
  const focusSkill = measured.length
    ? measured.reduce((weakest, skill) => (skill.score < weakest.score ? skill : weakest))
    : null;
  const sevenDaysAgo = new Date(input.now.getTime() - 6 * 86_400_000);
  const weeklyLearningDays = new Set(
    input.activityDates
      .filter((date) => date >= sevenDaysAgo && date <= input.now)
      .map(tokyoDateKey),
  ).size;
  const achievements = [...new Set(input.completedMissionTitles.filter(Boolean))]
    .slice(-6)
    .reverse();

  return {
    level,
    levelLabel: LEVEL_LABELS[level - 1] ?? LEVEL_LABELS[0],
    completedMissionCount,
    missionsUntilNextLevel: level === 5 ? null : level * MISSIONS_PER_LEVEL - completedMissionCount,
    weeklyLearningDays,
    streak: Math.max(0, Math.trunc(input.streak)),
    masteredSkillCount: skills.filter(({ status }) => status === 'MASTERED').length,
    strongestSkill,
    focusSkill,
    skills,
    achievements,
  };
}
