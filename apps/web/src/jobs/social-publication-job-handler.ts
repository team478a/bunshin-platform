import 'server-only';
import { SocialPublicationJobError, type SocialPublicationJobHandler } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { SupabaseSocialImageStorage } from '../social-image-storage';
import {
  InstagramDirectPublishingAdapter,
  InstagramPublishingError,
} from '../providers/instagram-direct-publishing';
import { socialAccountConnections } from '../services/social-account-connection-owner';

function classified(error: unknown) {
  if (!(error instanceof InstagramPublishingError))
    return new SocialPublicationJobError('INSTAGRAM_UNEXPECTED', true);
  if (['TRANSPORT', 'PROVIDER_ERROR', 'RATE_LIMIT'].includes(error.category))
    return new SocialPublicationJobError(`INSTAGRAM_${error.category}`, true);
  return new SocialPublicationJobError(`INSTAGRAM_${error.category}`, false);
}

export function createSocialPublicationJobHandler(): SocialPublicationJobHandler {
  return {
    async execute(input) {
      const db = await import('@bunshin/database');
      const repository = new db.PrismaSocialPublicationIntents(db.prisma);
      const claimed = await repository.claim(input);
      if (claimed.terminal) return;
      const environment = getServerEnvironment();
      const allowed = new Set(
        (environment.INSTAGRAM_PUBLISH_TEST_ACCOUNT_IDS ?? '').split(',').filter(Boolean),
      );
      if (!allowed.has(claimed.connection.externalAccountId))
        throw new SocialPublicationJobError('INSTAGRAM_TEST_ACCOUNT_REQUIRED', false);
      if (!environment.INSTAGRAM_GRAPH_API_VERSION)
        throw new SocialPublicationJobError('INSTAGRAM_CONFIGURATION_MISSING', false);

      const token = await (
        await socialAccountConnections()
      ).getUsableAccessToken(input.actorUserId, claimed.owner, claimed.intent.connectionId);
      const adapter = new InstagramDirectPublishingAdapter(environment.INSTAGRAM_GRAPH_API_VERSION);
      let containerId = claimed.intent.containerId;
      const storage = new SupabaseSocialImageStorage();
      if (!containerId) {
        try {
          const imageUrl = await storage.createPublishingJpegUrl(
            claimed.media.completedStorageKey,
            claimed.intent.id,
          );
          containerId = (
            await adapter.createImageContainer({
              igUserId: claimed.connection.externalAccountId,
              imageUrl,
              caption: claimed.intent.caption,
              accessToken: token,
            })
          ).containerId;
          await repository.recordContainer(claimed.intent.id, containerId);
        } catch (error) {
          throw classified(error);
        }
      }

      let status;
      try {
        status = await adapter.inspectContainer({ containerId, accessToken: token });
      } catch (error) {
        throw classified(error);
      }
      if (status === 'IN_PROGRESS')
        throw new SocialPublicationJobError('INSTAGRAM_CONTAINER_PROCESSING', true);
      if (status === 'ERROR' || status === 'EXPIRED')
        throw new SocialPublicationJobError(`INSTAGRAM_CONTAINER_${status}`, false);
      if (status === 'PUBLISHED') {
        // A prior response may have been lost. Never call media_publish again.
        await repository
          .beginAmbiguousPublish(claimed.intent.id, containerId)
          .catch(() => undefined);
        return;
      }
      await repository.beginAmbiguousPublish(claimed.intent.id, containerId);
      try {
        const published = await adapter.publishFinishedContainer({
          igUserId: claimed.connection.externalAccountId,
          containerId,
          accessToken: token,
        });
        await repository.complete(claimed.intent.id, published.externalPostId);
        await storage
          .removePublishingJpeg(claimed.media.completedStorageKey, claimed.intent.id)
          .catch(() => undefined);
      } catch {
        // State was made UNKNOWN before media_publish. Completing the Job is deliberate:
        // reconciliation may inspect Meta, but automatic resend can duplicate the post.
      }
    },
    async markFailed(input) {
      const db = await import('@bunshin/database');
      await new db.PrismaSocialPublicationIntents(db.prisma).markFailed(input);
    },
  };
}
