import 'server-only';
import {
  ActivateSocialProfile,
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

const values = {
  handle: z.string().nullable().optional(),
  profileUrl: z.string().nullable().optional(),
  purpose: z.string(),
  postingFrequency: z.enum(SOCIAL_POSTING_FREQUENCIES),
  preferredFormats: z.array(z.enum(SOCIAL_PREFERRED_FORMATS)),
};
const createSchema = z.object({ platform: z.enum(SOCIAL_PLATFORMS), ...values }).strict();
const updateSchema = z
  .object({
    handle: values.handle,
    profileUrl: values.profileUrl,
    purpose: values.purpose.optional(),
    postingFrequency: values.postingFrequency.optional(),
    preferredFormats: values.preferredFormats.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const emptySchema = z.object({}).strict();

async function actorUserId() {
  const currentUser = await (await currentUserProvider()).getCurrentUser();
  if (currentUser === null) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return currentUser.userId;
}

async function jsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  }
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

async function repositories() {
  const { PrismaBunshinCapabilityAssignmentRepository, PrismaSocialProfileRepository } =
    await import('@bunshin/database');
  return {
    assignments: new PrismaBunshinCapabilityAssignmentRepository(),
    profiles: new PrismaSocialProfileRepository(),
  };
}

export const socialProfileDto = (value: SocialProfile) => ({
  id: value.id,
  workspaceId: value.workspaceId,
  bunshinId: value.bunshinId,
  platform: value.platform,
  handle: value.handle,
  profileUrl: value.profileUrl,
  purpose: value.purpose,
  postingFrequency: value.postingFrequency,
  preferredFormats: value.preferredFormats,
  status: value.status,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
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

function platform(value: string): SocialPlatform {
  const parsed = z.enum(SOCIAL_PLATFORMS).safeParse(value);
  if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid platform');
  return parsed.data;
}

export function listSocialProfilesResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    const { profiles } = await repositories();
    const values = await new ListSocialProfiles(profiles).execute({
      workspaceId,
      bunshinId,
      actorUserId: await actorUserId(),
    });
    return values.map(socialProfileDto);
  });
}

export function createSocialProfileResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      const { assignments, profiles } = await repositories();
      return socialProfileDto(
        await new CreateSocialProfile(profiles, assignments).execute({
          platform: parsed.data.platform,
          purpose: parsed.data.purpose,
          postingFrequency: parsed.data.postingFrequency,
          preferredFormats: parsed.data.preferredFormats,
          ...(parsed.data.handle === undefined ? {} : { handle: parsed.data.handle }),
          ...(parsed.data.profileUrl === undefined ? {} : { profileUrl: parsed.data.profileUrl }),
          workspaceId,
          bunshinId,
          actorUserId: await actorUserId(),
        }),
      );
    },
    201,
  );
}

export function updateSocialProfileResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  platformValue: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = updateSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const { assignments, profiles } = await repositories();
    return socialProfileDto(
      await new UpdateSocialProfile(profiles, assignments).execute({
        ...(parsed.data.handle === undefined ? {} : { handle: parsed.data.handle }),
        ...(parsed.data.profileUrl === undefined ? {} : { profileUrl: parsed.data.profileUrl }),
        ...(parsed.data.purpose === undefined ? {} : { purpose: parsed.data.purpose }),
        ...(parsed.data.postingFrequency === undefined
          ? {}
          : { postingFrequency: parsed.data.postingFrequency }),
        ...(parsed.data.preferredFormats === undefined
          ? {}
          : { preferredFormats: parsed.data.preferredFormats }),
        platform: platform(platformValue),
        workspaceId,
        bunshinId,
        actorUserId: await actorUserId(),
      }),
    );
  });
}

export function setSocialProfileActiveResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  platformValue: string,
  active: boolean,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = emptySchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'empty body required');
    const { assignments, profiles } = await repositories();
    const input = {
      workspaceId,
      bunshinId,
      platform: platform(platformValue),
      actorUserId: await actorUserId(),
    };
    return socialProfileDto(
      active
        ? await new ActivateSocialProfile(profiles, assignments).execute(input)
        : await new DeactivateSocialProfile(profiles, assignments).execute(input),
    );
  });
}
