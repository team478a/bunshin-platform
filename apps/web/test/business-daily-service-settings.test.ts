import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  enforceBusinessDailyServiceSettings,
  enforceBusinessFreeRegistrationSettings,
} from '../src/services/business-daily-service-settings';
import { DEFAULT_SERVICE_DAILY_IDEA_DELIVERY } from '../src/services/service-onboarding-settings';

describe('business daily service settings', () => {
  it('keeps the selected login channels and locks daily ready-to-use text delivery', () => {
    const value = enforceBusinessDailyServiceSettings({
      businessProfileEnabled: true,
      emailEnabled: true,
      lineEnabled: false,
      inviteCodeEnabled: true,
      referralEnabled: true,
      dailyIdeaDelivery: {
        ...DEFAULT_SERVICE_DAILY_IDEA_DELIVERY,
        enabled: false,
        cadence: 'WEEKDAYS',
        lockCadence: false,
        contentMode: 'PROMPT',
        mediaMode: 'IMAGE_AND_VIDEO',
        videoBgm: { enabled: true, assetId: 'track', volumePercent: 20 },
        videoNarration: { enabled: true, voice: 'cedar', speed: 'STANDARD' },
        visualCharacter: { enabled: true, profileVersionId: 'character' },
      },
    });

    expect(value).toMatchObject({
      emailEnabled: true,
      lineEnabled: false,
      inviteCodeEnabled: false,
      referralEnabled: false,
      dailyIdeaDelivery: {
        enabled: true,
        cadence: 'DAILY',
        lockCadence: true,
        contentMode: 'READY_TO_USE',
        mediaMode: 'TEXT_ONLY',
        videoBgm: { enabled: false, assetId: null },
        videoNarration: { enabled: false },
        visualCharacter: { enabled: false, profileVersionId: null },
      },
    });
  });

  it('does not change other service settings', () => {
    const value = {
      businessProfileEnabled: false,
      emailEnabled: true,
      lineEnabled: false,
      inviteCodeEnabled: true,
      referralEnabled: true,
      dailyIdeaDelivery: DEFAULT_SERVICE_DAILY_IDEA_DELIVERY,
    };
    expect(enforceBusinessDailyServiceSettings(value)).toBe(value);
  });

  it('keeps selected login channels while enforcing public free registration', () => {
    expect(
      enforceBusinessFreeRegistrationSettings({
        businessProfileEnabled: true,
        registrationMode: 'CLOSED',
        emailEnabled: true,
        lineEnabled: false,
        inviteCodeEnabled: true,
        referralEnabled: true,
      }),
    ).toEqual({
      businessProfileEnabled: true,
      registrationMode: 'PUBLIC',
      emailEnabled: true,
      lineEnabled: false,
      inviteCodeEnabled: false,
      referralEnabled: false,
    });
  });

  it('lets the operator select email and LINE while retaining the free-service policy', () => {
    const editor = [
      '../app/s/[serviceSlug]/manage/settings/service-settings-editor.tsx',
      '../app/s/[serviceSlug]/manage/settings/service-basics-fields.tsx',
    ]
      .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
      .join('\n');
    const endpoint = readFileSync(
      new URL('../src/http/service-settings.ts', import.meta.url),
      'utf8',
    );

    expect(editor).toContain("emailEnabled: data.has('emailEnabled')");
    expect(editor).toContain("lineEnabled: data.has('lineEnabled')");
    expect(editor).toContain('メールだけ、LINEだけ、または両方を選べます。');
    expect(endpoint).toContain('enforceBusinessDailyServiceSettings(parsedValue)');
    expect(endpoint).toContain('enforceBusinessFreeRegistrationSettings(');
  });
});
