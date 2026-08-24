import 'server-only';
import {
  CreateLineRichMenuDraft,
  DisableLineRichMenu,
  ListLineRichMenus,
  PublishLineRichMenu,
  VerifyLineRichMenu,
  type LineRichMenu,
  type LineRichMenuArea,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { currentLineEnvironment } from '../line/secure-configuration';
import { LineRichMenuApiAdapter } from '../line/rich-menu-provider';
import { LineRichMenuStorage } from '../line/rich-menu-storage';

const uuid = z.string().uuid();
const text = z.object({ reason: z.string().min(3).max(500) }).strict();
const metadata = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).nullable().optional(),
    reason: z.string().min(3).max(500),
    template: z.enum(['FOUR_COLUMNS', 'TWO_BY_TWO']),
  })
  .strict();

async function actor() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return user.userId;
}
async function repository() {
  const db = await import('@bunshin/database');
  return new db.PrismaLineRichMenuRepository();
}
function dto(value: LineRichMenu) {
  return {
    ...value,
    lastSyncedAt: value.lastSyncedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}
async function respond(request: Request, operation: () => Promise<unknown>, status = 200) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
      { status, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
function areas(template: 'FOUR_COLUMNS' | 'TWO_BY_TWO', height: number): LineRichMenuArea[] {
  if (template === 'FOUR_COLUMNS') {
    const widths = [625, 625, 625, 625];
    const actions = [
      'OPEN_TODAY',
      'OPEN_BUNSHINS',
      'OPEN_NOTIFICATION_SETTINGS',
      'OPEN_ACCOUNT',
    ] as const;
    return actions.map((action, sortOrder) => ({
      action,
      x: widths.slice(0, sortOrder).reduce((sum, width) => sum + width, 0),
      y: 0,
      width: widths[sortOrder]!,
      height,
      sortOrder,
    }));
  }
  return [
    { action: 'OPEN_TODAY', x: 0, y: 0, width: 1250, height: 843, sortOrder: 0 },
    { action: 'OPEN_BUNSHINS', x: 1250, y: 0, width: 1250, height: 843, sortOrder: 1 },
    {
      action: 'OPEN_NOTIFICATION_SETTINGS',
      x: 0,
      y: 843,
      width: 1250,
      height: 843,
      sortOrder: 2,
    },
    { action: 'OPEN_ACCOUNT', x: 1250, y: 843, width: 1250, height: 843, sortOrder: 3 },
  ];
}

export function listLineRichMenusResponse(request: Request) {
  return respond(request, async () => ({
    environment: currentLineEnvironment(),
    menus: (
      await new ListLineRichMenus(await repository()).execute({
        actorUserId: await actor(),
        environment: currentLineEnvironment(),
      })
    ).map(dto),
  }));
}

export function createLineRichMenuResponse(request: Request) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const form = await request.formData();
      const image = form.get('image');
      const parsed = metadata.safeParse({
        name: form.get('name'),
        description: form.get('description') || null,
        reason: form.get('reason'),
        template: form.get('template'),
      });
      if (!(image instanceof File) || !parsed.success)
        throw new ApplicationError('VALIDATION_ERROR', '入力内容を確認してください');
      const environment = currentLineEnvironment();
      const storage = new LineRichMenuStorage();
      const stored = await storage.upload(environment, image);
      try {
        if (parsed.data.template === 'TWO_BY_TWO' && stored.height !== 1686)
          throw new ApplicationError(
            'VALIDATION_ERROR',
            '2行テンプレートは2500×1686の画像が必要です',
          );
        return dto(
          await new CreateLineRichMenuDraft(await repository()).execute({
            actorUserId: await actor(),
            environment,
            reason: parsed.data.reason,
            name: parsed.data.name,
            description: parsed.data.description ?? null,
            imageObjectKey: stored.objectKey,
            imageSha256: stored.sha256,
            imageContentType: stored.contentType,
            imageWidth: stored.width,
            imageHeight: stored.height,
            areas: areas(parsed.data.template, stored.height),
          }),
        );
      } catch (error) {
        await storage.remove(stored.objectKey);
        throw error;
      }
    },
    201,
  );
}

export function lineRichMenuImageResponse(request: Request, idValue: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  return (async () => {
    try {
      const id = uuid.safeParse(idValue);
      if (!id.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid id');
      const values = await new ListLineRichMenus(await repository()).execute({
        actorUserId: await actor(),
        environment: currentLineEnvironment(),
      });
      const menu = values.find((item) => item.id === id.data);
      if (!menu) throw new ApplicationError('NOT_FOUND', '画像が見つかりません');
      const image = await new LineRichMenuStorage().download(menu.imageObjectKey);
      return new Response(image, {
        headers: {
          'cache-control': 'private, no-store',
          'content-type': menu.imageContentType,
          'content-disposition': 'inline',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch (error) {
      const mapped = toApiError(error, requestId);
      return Response.json(mapped.body, {
        status: mapped.status,
        headers: { 'cache-control': 'private, no-store' },
      });
    }
  })();
}

async function action(
  request: Request,
  idValue: string,
  operation: 'verify' | 'publish' | 'disable',
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const id = uuid.safeParse(idValue);
    const parsed = text.safeParse(await body(request));
    if (!id.success || !parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', '入力内容を確認してください');
    const input = {
      actorUserId: await actor(),
      richMenuId: id.data,
      environment: currentLineEnvironment(),
      reason: parsed.data.reason,
    };
    if (operation === 'verify')
      return dto(await new VerifyLineRichMenu(await repository()).execute(input));
    if (operation === 'publish')
      return dto(
        await new PublishLineRichMenu(await repository(), new LineRichMenuApiAdapter()).execute(
          input,
        ),
      );
    return dto(
      await new DisableLineRichMenu(await repository(), new LineRichMenuApiAdapter()).execute(
        input,
      ),
    );
  });
}

export const verifyLineRichMenuResponse = (request: Request, id: string) =>
  action(request, id, 'verify');
export const publishLineRichMenuResponse = (request: Request, id: string) =>
  action(request, id, 'publish');
export const disableLineRichMenuResponse = (request: Request, id: string) =>
  action(request, id, 'disable');
