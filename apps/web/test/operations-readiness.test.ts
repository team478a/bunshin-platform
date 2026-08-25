import { describe, expect, it } from 'vitest';
import type {
  AiProviderConfiguration,
  LineChannelConfiguration,
  LineOperationalAssessment,
  LineRichMenu,
} from '@bunshin/application';
import { operationsReadiness } from '../app/(app)/admin/operations-readiness';

const now = new Date();
const ai = {
  id: 'ai',
  environment: 'PRODUCTION',
  provider: 'OPENAI',
  version: 1,
  status: 'ACTIVE',
  apiKeyConfigured: true,
  apiKeyMask: '••••1234',
  model: 'gpt-5.2',
  dailyBudgetUsdMicros: 1_000_000,
  monthlyBudgetUsdMicros: 5_000_000,
  globallyPaused: false,
  keyVersion: 1,
  lastVerifiedAt: now,
  lastErrorCategory: null,
  createdAt: now,
  updatedAt: now,
} satisfies AiProviderConfiguration;
const line = {
  id: 'line',
  environment: 'PRODUCTION',
  version: 2,
  status: 'ACTIVE',
  loginChannelId: 'login',
  loginSecretMask: '登録済み',
  messagingChannelId: 'message',
  messagingSecretMask: '登録済み',
  accessTokenMask: '登録済み',
  liffId: null,
  defaultNotificationTime: '08:00',
  defaultTimezone: 'Asia/Tokyo',
  quietHoursStart: '21:00',
  quietHoursEnd: '07:00',
  globallyPaused: false,
  quotaWarningPercent: 80,
  quotaLowPriorityStop: 90,
  keyVersion: 1,
  lastVerifiedAt: now,
  lastErrorCategory: null,
  createdAt: now,
  updatedAt: now,
} satisfies LineChannelConfiguration;
const trend = {
  ...ai,
  id: 'trend',
  provider: 'GROK',
  model: 'grok-4-fast',
} satisfies AiProviderConfiguration;
const richMenu = {
  id: 'menu',
  environment: 'PRODUCTION',
  version: 3,
  name: 'メニュー',
  description: null,
  status: 'ACTIVE',
  imageObjectKey: 'production/line-rich-menus/menu.png',
  imageSha256: 'a'.repeat(64),
  imageContentType: 'image/png',
  imageWidth: 2500,
  imageHeight: 843,
  lineRichMenuId: 'richmenu-1',
  lastSyncedAt: now,
  lastErrorCategory: null,
  areas: [],
  createdAt: now,
  updatedAt: now,
} satisfies LineRichMenu;
const assessment = {
  environment: 'PRODUCTION',
  ready: true,
  alerts: [],
  fingerprint: '12345678',
  checkedAt: now,
} satisfies LineOperationalAssessment;

describe('operationsReadiness', () => {
  it('必須設定と使用中設定が揃えば運用可能と判定する', () => {
    expect(
      operationsReadiness({
        aiConfigurations: [ai, trend],
        lineConfigurations: [line],
        lineAssessment: assessment,
        richMenus: [richMenu],
        encryptionKeyReady: true,
        cronSecretReady: true,
        storageReady: true,
      }),
    ).toMatchObject({ ready: true, actionRequired: 0, checkCount: 0 });
  });

  it('不足と停止を利用者向けの日本語警告に変換する', () => {
    const value = operationsReadiness({
      aiConfigurations: [{ ...ai, globallyPaused: true }],
      lineConfigurations: [],
      lineAssessment: {
        ...assessment,
        ready: false,
        alerts: [
          {
            code: 'ACTIVE_CONFIGURATION_MISSING',
            severity: 'CRITICAL',
            count: null,
          },
        ],
      },
      richMenus: [],
      encryptionKeyReady: false,
      cronSecretReady: false,
      storageReady: false,
    });
    expect(value.ready).toBe(false);
    expect(value.warnings.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        '文章作成AIが全体停止中です',
        '使用中の話題調査サービスがありません',
        '使用中のLINE設定がありません',
        '公開中のLINEメニューがありません',
        '秘密情報を守る鍵がありません',
      ]),
    );
  });

  it('話題調査サービスは接続確認済みの使用中設定を必須にする', () => {
    const value = operationsReadiness({
      aiConfigurations: [ai, { ...trend, lastVerifiedAt: null }],
      lineConfigurations: [line],
      lineAssessment: assessment,
      richMenus: [richMenu],
      encryptionKeyReady: true,
      cronSecretReady: true,
      storageReady: true,
    });
    expect(value.warnings).toContainEqual(
      expect.objectContaining({ code: 'TREND_PROVIDER_UNVERIFIED', level: 'ACTION_REQUIRED' }),
    );
  });
});
