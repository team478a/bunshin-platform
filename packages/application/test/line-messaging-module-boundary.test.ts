import { describe, expect, it } from 'vitest';
import * as delivery from '../src/line-message-delivery';
import * as core from '../src/line-messaging-core';
import * as notification from '../src/line-mission-notification';
import * as deepLink from '../src/mission-deep-link';

describe('LINE messaging module boundaries', () => {
  it('preserves the compatibility exports', () => {
    expect(core.ExecuteLineMissionDelivery).toBe(delivery.ExecuteLineMissionDelivery);
    expect(core.normalizeLineMissionNotificationSummary).toBe(
      notification.normalizeLineMissionNotificationSummary,
    );
    expect(core.IssueMissionDeepLinkState).toBe(deepLink.IssueMissionDeepLinkState);
  });

  it('keeps delivery, notification formatting, and deep links in separate modules', () => {
    expect(delivery.ExecuteLineMissionDelivery).toBeTypeOf('function');
    expect('IssueMissionDeepLinkState' in delivery).toBe(false);
    expect(notification.normalizeLineMissionNotificationSummary).toBeTypeOf('function');
    expect('ExecuteLineMissionDelivery' in notification).toBe(false);
    expect(deepLink.IssueMissionDeepLinkState).toBeTypeOf('function');
    expect('ExecuteLineMissionDelivery' in deepLink).toBe(false);
  });
});
