import { describe, expect, it } from 'vitest';

import {
  ExternalTrackingLinkService as PublicExternalTrackingLinkService,
  ExternalTrackingMemberLinkService as PublicExternalTrackingMemberLinkService,
  normalizeTrackingHostname as publicNormalizeTrackingHostname,
  selectExternalTrackingLink as publicSelectExternalTrackingLink,
} from '../src/external-tracking-links';
import { ExternalTrackingLinkService } from '../src/external-tracking-link-service';
import { ExternalTrackingMemberLinkService } from '../src/external-tracking-member-link-service';
import { selectExternalTrackingLink } from '../src/external-tracking-link-selection';
import { normalizeTrackingHostname } from '../src/external-tracking-link-validation';

describe('external tracking module boundaries', () => {
  it('keeps the compatibility entrypoint wired to the split modules', () => {
    expect(PublicExternalTrackingLinkService).toBe(ExternalTrackingLinkService);
    expect(PublicExternalTrackingMemberLinkService).toBe(ExternalTrackingMemberLinkService);
    expect(publicNormalizeTrackingHostname).toBe(normalizeTrackingHostname);
    expect(publicSelectExternalTrackingLink).toBe(selectExternalTrackingLink);
  });

  it('keeps administrator and member operations in separate services', () => {
    expect(ExternalTrackingLinkService).not.toBe(ExternalTrackingMemberLinkService);
    expect(ExternalTrackingLinkService.prototype).toHaveProperty('listConfiguration');
    expect(ExternalTrackingMemberLinkService.prototype).toHaveProperty('list');
  });
});
