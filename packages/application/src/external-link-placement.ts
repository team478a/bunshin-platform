import { ApplicationError } from '@bunshin/shared';

export const EXTERNAL_LINK_PLACEMENT_MARKER = '{{referral_url}}';
export const DEFAULT_EXTERNAL_LINK_PLACEMENT_TEMPLATE = `詳しくはこちら\n${EXTERNAL_LINK_PLACEMENT_MARKER}`;

export type ExternalLinkPlacementPlatform =
  'INSTAGRAM' | 'TIKTOK' | 'X' | 'THREADS' | 'YOUTUBE_SHORTS' | 'OTHER';
export type ExternalLinkPlacementFormat =
  'TEXT' | 'SLIDE' | 'LIVE_ACTION' | 'AI_VIDEO_PROMPT' | 'IMAGE';
export type ExternalLinkPlacementTarget = 'BODY' | 'CAPTION' | 'DESCRIPTION';
export type ExternalLinkPlacementStatus = 'ACTIVE' | 'DISABLED';

export interface ExternalLinkPlacementRepository {
  list(input: {
    workspaceId: string;
    actorUserId: string;
    productPackVersionId: string;
  }): Promise<object[] | null>;
  upsert(input: {
    workspaceId: string;
    actorUserId: string;
    productPackVersionId: string;
    platform: ExternalLinkPlacementPlatform;
    format: ExternalLinkPlacementFormat;
    target: ExternalLinkPlacementTarget;
    template: string;
    urlLocked: true;
    status: ExternalLinkPlacementStatus;
  }): Promise<object | null>;
  resolveForGeneration(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    productPackVersionId: string;
    platform: ExternalLinkPlacementPlatform;
    format: ExternalLinkPlacementFormat;
  }): Promise<{
    accessible: boolean;
    placement: {
      id: string;
      target: ExternalLinkPlacementTarget;
      template: string;
      version: number;
    } | null;
  }>;
}

export interface ResolvedExternalLinkPlacement {
  id: string | null;
  target: ExternalLinkPlacementTarget;
  template: string;
  version: number | null;
}

export function validateExternalLinkPlacementTemplate(value: string) {
  const template = value.trim();
  if (!template || template.length > 2_000)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid placement template');
  const controlCharacter = [...template].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || (code >= 11 && code <= 31) || code === 127;
  });
  const markers = template.match(/{{\s*[^{}]+\s*}}/g) ?? [];
  if (
    controlCharacter ||
    markers.length !== 1 ||
    markers[0] !== EXTERNAL_LINK_PLACEMENT_MARKER ||
    /<\/?(?:script|iframe|object|embed|form)\b/i.test(template) ||
    /(?:https?:\/\/|javascript:|data:)/i.test(template)
  )
    throw new ApplicationError('VALIDATION_ERROR', 'unsafe placement template');
  return template;
}

export function defaultExternalLinkPlacement(
  format: ExternalLinkPlacementFormat,
): ResolvedExternalLinkPlacement {
  return {
    id: null,
    target: format === 'TEXT' ? 'BODY' : 'CAPTION',
    template: DEFAULT_EXTERNAL_LINK_PLACEMENT_TEMPLATE,
    version: null,
  };
}

export function applyExternalLinkPlacement(input: {
  content: Record<string, unknown>;
  url: string;
  platform: ExternalLinkPlacementPlatform;
  format: ExternalLinkPlacementFormat;
  placement: ResolvedExternalLinkPlacement;
}) {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid resolved tracking URL');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid resolved tracking URL');
  const key =
    input.placement.target === 'BODY'
      ? 'body'
      : input.placement.target === 'CAPTION'
        ? 'caption'
        : 'description';
  const current = input.content[key];
  if (typeof current !== 'string' || !current.trim())
    throw new ApplicationError('VALIDATION_ERROR', 'placement target is unavailable');
  const block = validateExternalLinkPlacementTemplate(input.placement.template).replace(
    EXTERNAL_LINK_PLACEMENT_MARKER,
    parsed.toString(),
  );
  const value = `${current.trim()}\n\n${block}`;
  const maximum =
    key === 'caption'
      ? 2_200
      : key === 'description'
        ? 5_000
        : input.platform === 'X'
          ? 280
          : input.platform === 'THREADS'
            ? 500
            : 10_000;
  if (value.length > maximum)
    throw new ApplicationError('CONTENT_REJECTED', 'tracking URL exceeds platform limit');
  return { ...input.content, [key]: value };
}

export class ExternalLinkPlacementService {
  constructor(private readonly repository: ExternalLinkPlacementRepository) {}

  list(input: { workspaceId: string; actorUserId: string; productPackVersionId: string }) {
    return this.required(this.repository.list(input));
  }

  upsert(
    input: Omit<
      Parameters<ExternalLinkPlacementRepository['upsert']>[0],
      'template' | 'urlLocked'
    > & {
      template: string;
    },
  ) {
    return this.required(
      this.repository.upsert({
        ...input,
        template: validateExternalLinkPlacementTemplate(input.template),
        urlLocked: true,
      }),
    );
  }

  async resolveForGeneration(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    productPackVersionId: string;
    platform: ExternalLinkPlacementPlatform;
    format: ExternalLinkPlacementFormat;
  }) {
    const result = await this.repository.resolveForGeneration(input);
    if (!result.accessible) throw new ApplicationError('NOT_FOUND', 'placement scope not found');
    return result.placement ?? defaultExternalLinkPlacement(input.format);
  }

  private async required<T>(operation: Promise<T | null>) {
    const value = await operation;
    if (value === null) throw new ApplicationError('NOT_FOUND', 'placement scope not found');
    return value;
  }
}
