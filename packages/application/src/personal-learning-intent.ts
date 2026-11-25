import { ApplicationError } from '@bunshin/shared';

const kinds = ['knowledge', 'research', 'practice', 'multi-service', 'combined'] as const;
const channels = ['browser', 'native', 'unknown'] as const;
const checks = ['visible', 'input-value', 'artifact', 'manual'] as const;
const environmentKeys = ['device', 'os', 'client', 'plan', 'language', 'experience'] as const;

export interface LearningIntentAnalysis {
  kind: (typeof kinds)[number];
  goal: string;
  environment: Record<(typeof environmentKeys)[number], string | null> & {
    channel: (typeof channels)[number];
  };
  prerequisites: string[];
  steps: {
    objective: string;
    service: string | null;
    feature: string | null;
    deliverable: string | null;
    success: { kind: (typeof checks)[number]; expected: string };
  }[];
  questions: string[];
}

const fail = (): never => {
  throw new ApplicationError('VALIDATION_ERROR', 'invalid learning intent analysis');
};

function exact(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== keys.length || keys.some((key) => !Object.hasOwn(data, key)))
    return fail();
  return data;
}

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : fail();
}

function optionalText(value: unknown, max: number) {
  return value === null ? null : text(value, max);
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T {
  return options.find((item) => item === value) ?? fail();
}

function list<T>(value: unknown, max: number, parse: (item: unknown) => T): T[] {
  return Array.isArray(value) && value.length <= max ? Array.from(value, parse) : fail();
}

export function validateLearningIntentAnalysis(value: unknown): LearningIntentAnalysis {
  const data = exact(value, ['kind', 'goal', 'environment', 'prerequisites', 'steps', 'questions']);
  const env = exact(data['environment'], [...environmentKeys, 'channel']);
  const kind = oneOf(data['kind'], kinds);
  const steps = list(data['steps'], 6, (item) => {
    const step = exact(item, ['objective', 'service', 'feature', 'deliverable', 'success']);
    const success = exact(step['success'], ['kind', 'expected']);
    return {
      objective: text(step['objective'], 180),
      service: optionalText(step['service'], 80),
      feature: optionalText(step['feature'], 100),
      deliverable: optionalText(step['deliverable'], 160),
      success: { kind: oneOf(success['kind'], checks), expected: text(success['expected'], 180) },
    };
  });
  const questions = list(data['questions'], 2, (item) => text(item, 180));
  if (steps.length === 0 && questions.length === 0) return fail();
  return {
    kind,
    goal: text(data['goal'], 180),
    environment: {
      device: optionalText(env['device'], 80),
      os: optionalText(env['os'], 80),
      client: optionalText(env['client'], 80),
      plan: optionalText(env['plan'], 80),
      language: optionalText(env['language'], 80),
      experience: optionalText(env['experience'], 120),
      channel: oneOf(env['channel'], channels),
    },
    prerequisites: list(data['prerequisites'], 4, (item) => text(item, 150)),
    steps,
    questions,
  };
}

function schemaObject(properties: Record<string, unknown>) {
  return { type: 'object', properties, required: Object.keys(properties) };
}

export function learningIntentAnalysisSchema() {
  const string = { type: 'string' };
  const nullable = { ...string, nullable: true };
  const strings = { type: 'array', items: string };
  return schemaObject({
    kind: { ...string, enum: kinds },
    goal: string,
    environment: schemaObject({
      ...Object.fromEntries(environmentKeys.map((key) => [key, nullable])),
      channel: { ...string, enum: channels },
    }),
    prerequisites: strings,
    steps: {
      type: 'array',
      items: schemaObject({
        objective: string,
        service: nullable,
        feature: nullable,
        deliverable: nullable,
        success: schemaObject({ kind: { ...string, enum: checks }, expected: string }),
      }),
    },
    questions: strings,
  });
}
