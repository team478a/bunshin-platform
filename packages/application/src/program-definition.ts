import { ApplicationError } from '@bunshin/shared';

export const PROGRAM_DEFINITION_PRESETS = ['SIDE_HUSTLE_90_DAY', 'SIMPLE'] as const;
export type ProgramDefinitionPreset = (typeof PROGRAM_DEFINITION_PRESETS)[number];

export const PROGRAM_MISSION_TYPES = ['FIXED', 'TEMPLATE'] as const;
export type ProgramMissionType = (typeof PROGRAM_MISSION_TYPES)[number];

export interface ProgramDefinitionV1 {
  schemaVersion: 1;
  duration: { type: 'FIXED_DAYS'; days: number } | { type: 'OPEN_ENDED' };
  participation: 'INVITATION_ONLY';
  supportModes: Array<'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE'>;
  routes: Array<{ key: string; label: string; isDefault: boolean }>;
  phases: Array<{
    key: string;
    order: number;
    label: string;
    title: string;
    description: string;
    startDay: number;
    endDay: number;
    goals: string[];
  }>;
  missions: Array<{
    key: string;
    routeKey: string;
    phaseKey: string;
    type: ProgramMissionType;
    title: string;
    capability: string;
    schedule: { type: 'DAY_OF_WEEK'; dayOfWeek: number };
    estimatedMinutes: number;
    completionEvent: string;
  }>;
  notificationPolicy: {
    cadence: 'DAILY';
    dormantAfterDays: number;
  };
  resultDefinitions: Array<{
    key: string;
    label: string;
    eventType: string;
  }>;
}

export interface ProgramDefinitionIssue {
  path: string;
  message: string;
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const textValue = (value: unknown) => (typeof value === 'string' ? value : '');
const numberValue = (value: unknown) => (typeof value === 'number' ? value : Number.NaN);

const keyPattern = /^[A-Z][A-Z0-9_]{0,79}$/;

function duplicateKeys(values: Array<{ key: string }>) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.key)) return true;
    seen.add(value.key);
    return false;
  });
}

export function validateProgramDefinition(value: unknown): ProgramDefinitionIssue[] {
  const issues: ProgramDefinitionIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  if (!object(value)) return [{ path: '$', message: '定義はオブジェクトである必要があります。' }];
  if (value.schemaVersion !== 1) add('schemaVersion', 'schemaVersionは1である必要があります。');

  const duration = value.duration;
  if (!object(duration) || !['FIXED_DAYS', 'OPEN_ENDED'].includes(String(duration.type))) {
    add('duration', '期間の種類が正しくありません。');
  } else if (
    duration.type === 'FIXED_DAYS' &&
    (!Number.isInteger(duration.days) || Number(duration.days) < 1 || Number(duration.days) > 3650)
  ) {
    add('duration.days', '固定期間は1日から3650日の整数で指定してください。');
  }

  if (value.participation !== 'INVITATION_ONLY')
    add('participation', 'V1の参加方法はINVITATION_ONLYのみ利用できます。');
  if (
    !Array.isArray(value.supportModes) ||
    value.supportModes.length === 0 ||
    value.supportModes.some(
      (mode) => !['IDEA_ONLY', 'GUIDED', 'READY_TO_USE'].includes(String(mode)),
    )
  )
    add('supportModes', '利用可能な支援方法を1つ以上指定してください。');

  const routes = Array.isArray(value.routes) ? value.routes : [];
  if (routes.length === 0) add('routes', 'ルートを1つ以上指定してください。');
  const parsedRoutes = routes.filter(object).map((route) => ({
    key: textValue(route.key),
    label: textValue(route.label),
    isDefault: route.isDefault === true,
  }));
  parsedRoutes.forEach((route, index) => {
    if (!keyPattern.test(route.key)) add(`routes.${index}.key`, 'ルートキーが正しくありません。');
    if (!route.label.trim()) add(`routes.${index}.label`, 'ルート名は必須です。');
  });
  if (duplicateKeys(parsedRoutes).length > 0) add('routes', 'ルートキーが重複しています。');
  if (parsedRoutes.filter((route) => route.isDefault).length !== 1)
    add('routes', '標準ルートを1つだけ指定してください。');

  const phases = Array.isArray(value.phases) ? value.phases : [];
  if (phases.length === 0) add('phases', '段階を1つ以上指定してください。');
  const parsedPhases = phases.filter(object).map((phase) => ({
    key: textValue(phase.key),
    order: numberValue(phase.order),
    label: textValue(phase.label),
    title: textValue(phase.title),
    description: textValue(phase.description),
    startDay: numberValue(phase.startDay),
    endDay: numberValue(phase.endDay),
    goals: phase.goals,
  }));
  parsedPhases.forEach((phase, index) => {
    if (!keyPattern.test(phase.key)) add(`phases.${index}.key`, '段階キーが正しくありません。');
    if (!Number.isInteger(phase.order) || phase.order < 1)
      add(`phases.${index}.order`, '表示順は1以上の整数で指定してください。');
    if (!phase.label.trim() || !phase.title.trim() || !phase.description.trim())
      add(`phases.${index}`, '段階の名前、見出し、説明は必須です。');
    if (
      !Number.isInteger(phase.startDay) ||
      !Number.isInteger(phase.endDay) ||
      phase.startDay < 1 ||
      phase.endDay < phase.startDay
    )
      add(`phases.${index}`, '開始日と終了日が正しくありません。');
    if (!Array.isArray(phase.goals) || phase.goals.length === 0)
      add(`phases.${index}.goals`, '目標を1つ以上指定してください。');
  });
  if (duplicateKeys(parsedPhases).length > 0) add('phases', '段階キーが重複しています。');
  const ordered = [...parsedPhases].sort((a, b) => a.order - b.order);
  if (new Set(parsedPhases.map((phase) => phase.order)).size !== parsedPhases.length)
    add('phases', '段階の表示順が重複しています。');
  ordered.forEach((phase, index) => {
    if (index > 0) {
      const previous = ordered[index - 1]!;
      if (phase.startDay <= previous.endDay) add('phases', '段階の日付範囲が重複しています。');
      else if (phase.startDay !== previous.endDay + 1)
        add('phases', '段階の日付範囲に空白があります。');
    }
  });
  if (object(duration) && duration.type === 'FIXED_DAYS' && ordered.length > 0) {
    if (ordered[0]?.startDay !== 1 || ordered.at(-1)?.endDay !== duration.days)
      add('phases', '固定期間は1日目から最終日まで段階で埋めてください。');
  }

  const routeKeys = new Set(parsedRoutes.map((route) => route.key));
  const phaseKeys = new Set(parsedPhases.map((phase) => phase.key));
  const missions = Array.isArray(value.missions) ? value.missions : [];
  if (missions.length === 0) add('missions', '行動を1つ以上指定してください。');
  const missionKeys: string[] = [];
  missions.forEach((mission, index) => {
    if (!object(mission)) {
      add(`missions.${index}`, '行動の形式が正しくありません。');
      return;
    }
    const key = textValue(mission.key);
    missionKeys.push(key);
    if (!keyPattern.test(key)) add(`missions.${index}.key`, '行動キーが正しくありません。');
    if (!routeKeys.has(textValue(mission.routeKey)))
      add(`missions.${index}.routeKey`, '存在しないルートが指定されています。');
    if (!phaseKeys.has(textValue(mission.phaseKey)))
      add(`missions.${index}.phaseKey`, '存在しない段階が指定されています。');
    if (!PROGRAM_MISSION_TYPES.includes(mission.type as ProgramMissionType))
      add(`missions.${index}.type`, 'V1ではFIXEDまたはTEMPLATEを指定してください。');
    if (!textValue(mission.title).trim() || !textValue(mission.capability).trim())
      add(`missions.${index}`, '行動の見出しと実行機能は必須です。');
    if (!keyPattern.test(textValue(mission.completionEvent)))
      add(`missions.${index}.completionEvent`, '完了イベントが正しくありません。');
    if (
      !object(mission.schedule) ||
      mission.schedule.type !== 'DAY_OF_WEEK' ||
      !Number.isInteger(mission.schedule.dayOfWeek) ||
      Number(mission.schedule.dayOfWeek) < 0 ||
      Number(mission.schedule.dayOfWeek) > 6
    )
      add(`missions.${index}.schedule`, '曜日は0から6で指定してください。');
    if (
      !Number.isInteger(mission.estimatedMinutes) ||
      Number(mission.estimatedMinutes) < 1 ||
      Number(mission.estimatedMinutes) > 480
    )
      add(`missions.${index}.estimatedMinutes`, '所要時間が正しくありません。');
  });
  if (new Set(missionKeys).size !== missionKeys.length)
    add('missions', '行動キーが重複しています。');

  if (!object(value.notificationPolicy) || value.notificationPolicy.cadence !== 'DAILY')
    add('notificationPolicy', '通知方針が正しくありません。');
  else if (
    !Number.isInteger(value.notificationPolicy.dormantAfterDays) ||
    Number(value.notificationPolicy.dormantAfterDays) < 1
  )
    add('notificationPolicy.dormantAfterDays', '休眠判定日数が正しくありません。');

  const results = Array.isArray(value.resultDefinitions) ? value.resultDefinitions : [];
  const resultKeys: string[] = [];
  results.forEach((result, index) => {
    if (object(result)) resultKeys.push(textValue(result.key));
    if (
      !object(result) ||
      !keyPattern.test(textValue(result.key)) ||
      !textValue(result.label).trim() ||
      !keyPattern.test(textValue(result.eventType))
    )
      add(`resultDefinitions.${index}`, '成果定義が正しくありません。');
  });
  if (new Set(resultKeys).size !== resultKeys.length)
    add('resultDefinitions', '成果キーが重複しています。');
  return issues;
}

export function parseProgramDefinition(value: unknown): ProgramDefinitionV1 {
  const issues = validateProgramDefinition(value);
  if (issues.length > 0)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      `invalid program definition: ${issues[0]!.path} ${issues[0]!.message}`,
    );
  return value as ProgramDefinitionV1;
}

export function programDefinitionSummary(value: unknown): {
  durationLabel: string;
  phaseCount: number;
  missionCount: number;
  resultCount: number;
} | null {
  if (validateProgramDefinition(value).length > 0) return null;
  const definition = value as ProgramDefinitionV1;
  return {
    durationLabel:
      definition.duration.type === 'FIXED_DAYS'
        ? `${definition.duration.days}日間`
        : '期間の定めなし',
    phaseCount: definition.phases.length,
    missionCount: definition.missions.length,
    resultCount: definition.resultDefinitions.length,
  };
}

export type ProgramDefinitionJsonValue =
  | null
  | boolean
  | number
  | string
  | ProgramDefinitionJsonValue[]
  | { [key: string]: ProgramDefinitionJsonValue };

export function programDefinitionJson(definition: ProgramDefinitionV1): {
  [key: string]: ProgramDefinitionJsonValue;
} {
  return {
    schemaVersion: definition.schemaVersion,
    duration: { ...definition.duration },
    participation: definition.participation,
    supportModes: [...definition.supportModes],
    routes: definition.routes.map((route) => ({ ...route })),
    phases: definition.phases.map((phase) => ({ ...phase, goals: [...phase.goals] })),
    missions: definition.missions.map((mission) => ({
      ...mission,
      schedule: { ...mission.schedule },
    })),
    notificationPolicy: { ...definition.notificationPolicy },
    resultDefinitions: definition.resultDefinitions.map((result) => ({ ...result })),
  };
}
