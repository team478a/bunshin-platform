import { ApplicationError } from '@bunshin/shared';
import type { ExternalTrackingMemberLinkRepository } from './external-tracking-link-types';
import { validateExternalTrackingUrl } from './external-tracking-link-validation';

export class ExternalTrackingMemberLinkService {
  constructor(private readonly repository: ExternalTrackingMemberLinkRepository) {}

  list(input: { workspaceId: string; groupId: string; actorUserId: string }) {
    return this.repository.listMemberSettings(input).then((value) => {
      if (!value) throw new ApplicationError('NOT_FOUND', 'service membership unavailable');
      return value;
    });
  }

  async saveDraft(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    systemId: string;
    allowedDomainId: string;
    url: string;
  }) {
    const settings = await this.list(input);
    const system = settings.systems.find((item) => item.id === input.systemId);
    const domain = system?.domains.find((item) => item.id === input.allowedDomainId);
    if (!system || !domain)
      throw new ApplicationError('NOT_FOUND', 'allowed tracking domain unavailable');
    const url = validateExternalTrackingUrl(input.url, domain);
    const saved = await this.repository.saveMemberDraft({ ...input, url, now: new Date() });
    if (!saved) throw new ApplicationError('NOT_FOUND', 'service membership unavailable');
    return saved;
  }
}
