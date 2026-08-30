import 'server-only';
import { AssignCapabilityToBunshin } from '@bunshin/application';
import {
  ActivateSocialProfile,
  CONTENT_ASSISTANCE_LEVELS,
  CreateSocialProfile,
  DeactivateSocialProfile,
  ListSocialProfiles,
  SOCIAL_PLATFORMS,
  SOCIAL_POSTING_FREQUENCIES,
  SOCIAL_PREFERRED_FORMATS,
  UpdateSocialProfile,
  type SocialPlatform,
  type SocialProfile,
} from '@bunshin/capability-social';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePublicServiceContext } from '../services/public-service';

const values = {
  handle: z.string().nullable().optional(),
  profileUrl: z.string().nullable().optional(),
  purpose: z.string(),
  postingFrequency: z.enum(SOCIAL_POSTING_FREQUENCIES),
  preferredFormats: z.array(z.enum(SOCIAL_PREFERRED_FORMATS)),
  defaultAssistanceLevel: z.enum(CONTENT_ASSISTANCE_LEVELS).optional(),
};
const createSchema = z.object({ platform: z.enum(SOCIAL_PLATFORMS), ...values }).strict();
const updateSchema = z
  .object({
    handle: values.handle,
    profileUrl: values.profileUrl,
    purpose: values.purpose.optional(),
    postingFrequency: values.postingFrequency.optional(),
    preferredFormats: values.preferredFormats.optional(),
    defaultAssistanceLevel: values.defaultAssistanceLevel.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

async function actorUserId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

async function jsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  }
  try {
    return await request.json();
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

async function repositories() {
  const db = await import('@bunshin/database');
  return {
    assignments: new db.PrismaBunshinCapabilityAssignmentRepository(),
    profiles: new db.PrismaSocialProfileRepository(),
  };
}

const dto = (value: SocialProfile) => ({
  id: value.id,
  platform: value.platform,
  handle: value.handle,
  profileUrl: value.profileUrl,
  purpose: value.purpose,
  postingFrequency: value.postingFrequency,
  preferredFormats: value.preferredFormats,
  defaultAssistanceLevel: value.defaultAssistanceLevel,
  status: value.status,
});

async function respond(request: Request, operation: () => Promise<unknown>, status = 200) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
      { status, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}

async function scope(serviceSlug: string, bunshinId: string) {
  const [service, actor] = await Promise.all([
    resolvePublicServiceContext(serviceSlug),
    actorUserId(),
  ]);
  return {
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    bunshinId,
    actorUserId: actor,
  };
}

function platform(value: string): SocialPlatform {
  const parsed = z.enum(SOCIAL_PLATFORMS).safeParse(value);
  if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid platform');
  return parsed.data;
}

export function listServiceSocialProfilesResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    const input = await scope(serviceSlug, bunshinId);
    const { profiles } = await repositories();
    return (await new ListSocialProfiles(profiles).execute(input)).map(dto);
  });
}

export function createServiceSocialProfileResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      const input = await scope(serviceSlug, bunshinId);
      const { assignments, profiles } = await repositories();
      await new AssignCapabilityToBunshin(assignments).execute({
        ...input,
        capabilityType: 'SOCIAL',
      });
      return dto(
        await new CreateSocialProfile(profiles, assignments).execute({
          ...input,
          platform: parsed.data.platform,
          purpose: parsed.data.purpose,
          postingFrequency: parsed.data.postingFrequency,
          preferredFormats: parsed.data.preferredFormats,
          ...(parsed.data.handle === undefined ? {} : { handle: parsed.data.handle }),
          ...(parsed.data.profileUrl === undefined ? {} : { profileUrl: parsed.data.profileUrl }),
          ...(parsed.data.defaultAssistanceLevel === undefined
            ? {}
            : { defaultAssistanceLevel: parsed.data.defaultAssistanceLevel }),
        }),
      );
    },
    201,
  );
}

export function updateServiceSocialProfileResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  platformValue: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = updateSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const input = await scope(serviceSlug, bunshinId);
    const { assignments, profiles } = await repositories();
    return dto(
      await new UpdateSocialProfile(profiles, assignments).execute({
        ...input,
        platform: platform(platformValue),
        ...(parsed.data.handle === undefined ? {} : { handle: parsed.data.handle }),
        ...(parsed.data.profileUrl === undefined ? {} : { profileUrl: parsed.data.profileUrl }),
        ...(parsed.data.purpose === undefined ? {} : { purpose: parsed.data.purpose }),
        ...(parsed.data.postingFrequency === undefined
          ? {}
          : { postingFrequency: parsed.data.postingFrequency }),
        ...(parsed.data.preferredFormats === undefined
          ? {}
          : { preferredFormats: parsed.data.preferredFormats }),
        ...(parsed.data.defaultAssistanceLevel === undefined
          ? {}
          : { defaultAssistanceLevel: parsed.data.defaultAssistanceLevel }),
      }),
    );
  });
}

export function setServiceSocialProfileActiveResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  platformValue: string,
  active: boolean,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = z
      .object({})
      .strict()
      .safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'empty body required');
    const input = { ...(await scope(serviceSlug, bunshinId)), platform: platform(platformValue) };
    const { assignments, profiles } = await repositories();
    return dto(
      active
        ? await new ActivateSocialProfile(profiles, assignments).execute(input)
        : await new DeactivateSocialProfile(profiles, assignments).execute(input),
    );
  });
}
