import { describe, expect, it } from 'vitest';
import {
  buildOpsMorningDigest,
  OPS_MORNING_DIGEST_UNIMPLEMENTED_ITEMS,
  opsMorningDigestDateWindow,
  type BuildOpsMorningDigestInput,
} from '../src/ops-morning-digest';

const healthyInput = (): BuildOpsMorningDigestInput => ({
  targetDate: '2026-10-19',
  alerts: { status: 'OK', value: [] },
  serviceBroadcasts: { status: 'OK', value: [] },
  fortuneWeeklyBroadcasts: {
    status: 'NOT_APPLICABLE',
    reason: 'NO_SCHEDULED_FORTUNE_DELIVERY',
  },
  invoices: { status: 'OK', value: [] },
  missingBroadcastDateCount: { status: 'OK', value: 0 },
  previousDelivery: 'SENT',
  appUrl: 'https://example.test/',
});

describe('morning operations digest', () => {
  it('creates the concise no-issues email when all implemented collectors are healthy', () => {
    const report = buildOpsMorningDigest(healthyInput());

    expect(report).toMatchObject({
      status: 'NO_ISSUES',
      criticalCount: 0,
      warningCount: 0,
      subject: '【ワタシワークス運用】10/19 異常なし',
    });
    expect(report.body.split('\n')).toEqual([
      '前日の定期処理・配信・通知はすべて正常でした。管理画面：https://example.test/admin/alerts',
      expect.stringContaining('この版で未対応の項目：'),
    ]);
    expect(report.body).toContain(`（${OPS_MORNING_DIGEST_UNIMPLEMENTED_ITEMS.length}項目）`);
  });

  it('uses only Alert Center severity and preserves the required display order', () => {
    const input = healthyInput();
    input.alerts = {
      status: 'OK',
      value: [
        { code: 'info', severity: 'INFO', title: '再送待ち', count: 1, href: '/admin/line' },
        {
          code: 'warning',
          severity: 'WARNING',
          title: '緊急の問い合わせ',
          count: 1,
          href: '/admin/support',
        },
        {
          code: 'critical',
          severity: 'CRITICAL',
          title: '停止中の処理',
          count: 2,
          href: '/admin/guide',
        },
      ],
    };
    input.serviceBroadcasts = {
      status: 'OK',
      value: [{ serviceName: '研修サービス', status: 'COMPLETED', count: 3 }],
    };
    input.invoices = {
      status: 'OK',
      value: [{ status: 'ISSUED', count: 4 }],
    };

    const report = buildOpsMorningDigest(input);
    const criticalIndex = report.body.indexOf('停止中の処理');
    const warningIndex = report.body.indexOf('緊急の問い合わせ');
    const infoIndex = report.body.indexOf('再送待ち');
    const broadcastIndex = report.body.indexOf('研修サービス');
    const invoiceIndex = report.body.indexOf('OEM請求書 ISSUED');
    const collectionIndex = report.body.indexOf('運用通知センター:');

    expect(report.subject).toContain('異常1件・注意1件');
    expect(report.criticalCount).toBe(1);
    expect(report.warningCount).toBe(1);
    expect(criticalIndex).toBeLessThan(warningIndex);
    expect(warningIndex).toBeLessThan(infoIndex);
    expect(infoIndex).toBeLessThan(broadcastIndex);
    expect(broadcastIndex).toBeLessThan(invoiceIndex);
    expect(invoiceIndex).toBeLessThan(collectionIndex);
  });

  it('never turns an unavailable collector into zero or a no-issues subject', () => {
    const input = healthyInput();
    input.serviceBroadcasts = {
      status: 'UNAVAILABLE',
      errorCategory: 'DATABASE_READ_FAILED',
    };

    const report = buildOpsMorningDigest(input);

    expect(report.status).toBe('COLLECTION_FAILED');
    expect(report.subject).toContain('取得失敗1項目');
    expect(report.subject).not.toContain('異常なし');
    expect(report.body).toContain('LINE配信: 取得失敗（DATABASE_READ_FAILED）');
    expect(report.body).not.toContain('Error: raw database exception');
  });

  it('does not call INFO a warning and includes it as a reference item on a no-issues email', () => {
    const input = healthyInput();
    input.alerts = {
      status: 'OK',
      value: [
        { code: 'retry', severity: 'INFO', title: '再送待ち', count: 2, href: '/admin/line' },
      ],
    };

    const report = buildOpsMorningDigest(input);

    expect(report.status).toBe('NO_ISSUES');
    expect(report.subject).toContain('異常なし');
    expect(report.warningCount).toBe(0);
    expect(report.body).toContain('INFO（参考）：再送待ち https://example.test/admin/line');
    expect(report.body.split('\n')).toHaveLength(2);
  });

  it('does not claim no issues when the prior digest is missing or unconfirmed', () => {
    const notSent = buildOpsMorningDigest({ ...healthyInput(), previousDelivery: 'NOT_SENT' });
    const unknown = buildOpsMorningDigest({ ...healthyInput(), previousDelivery: 'UNKNOWN' });

    expect(notSent.status).toBe('DELIVERY_UNCONFIRMED');
    expect(notSent.subject).toContain('前日まとめ未送信');
    expect(notSent.body).toContain('前日のまとめ：未送信');
    expect(unknown.status).toBe('DELIVERY_UNCONFIRMED');
    expect(unknown.subject).toContain('送信状況未確認');
  });

  it('labels the days before the first send record as before history', () => {
    const report = buildOpsMorningDigest({ ...healthyInput(), previousDelivery: 'BEFORE_HISTORY' });
    expect(report.status).toBe('NO_ISSUES');
    expect(report.subject).toContain('異常なし');
    expect(report.body).toContain('前日のまとめ：履歴開始前');
  });

  it('builds absolute links without double slashes and preserves existing absolute links', () => {
    const withTrailingSlash = buildOpsMorningDigest({
      ...healthyInput(),
      appUrl: 'https://example.test///',
      alerts: {
        status: 'OK',
        value: [
          {
            code: 'external',
            severity: 'INFO',
            title: '参考',
            count: null,
            href: 'https://docs.example.test/help',
          },
        ],
      },
    });
    expect(withTrailingSlash.body).toContain('https://example.test/admin/alerts');
    expect(withTrailingSlash.body).toContain('https://docs.example.test/help');
    expect(withTrailingSlash.body).not.toContain('https://example.test///admin');
    expect(withTrailingSlash.body).not.toContain('https://example.test/https://docs');
  });

  it('reports incomplete-date broadcast records without changing the issue severity', () => {
    const report = buildOpsMorningDigest({
      ...healthyInput(),
      missingBroadcastDateCount: { status: 'OK', value: 3 },
    });
    expect(report.status).toBe('NO_ISSUES');
    expect(report.body).toContain('日時未設定の配信記録：3件（全期間）');
  });

  it('uses the JST previous-day half-open UTC interval at both midnight boundaries', () => {
    const beforeTokyoMidnight = opsMorningDigestDateWindow(new Date('2026-10-19T14:59:59.000Z'));
    const atTokyoMidnight = opsMorningDigestDateWindow(new Date('2026-10-19T15:00:00.000Z'));

    expect(beforeTokyoMidnight).toMatchObject({
      targetDate: '2026-10-18',
      from: new Date('2026-10-17T15:00:00.000Z'),
      to: new Date('2026-10-18T15:00:00.000Z'),
    });
    expect(atTokyoMidnight).toMatchObject({
      targetDate: '2026-10-19',
      from: new Date('2026-10-18T15:00:00.000Z'),
      to: new Date('2026-10-19T15:00:00.000Z'),
    });
    expect(opsMorningDigestDateWindow(new Date('2026-10-19T15:00:01.000Z')).targetDate).toBe(
      '2026-10-19',
    );
  });

  it('does not echo personal identifiers, money, free text, or raw error content into the email', () => {
    const input = healthyInput();
    input.alerts = {
      status: 'OK',
      value: [
        {
          code: 'safe-static-code',
          severity: 'WARNING',
          title: '固定された通知ラベル',
          count: 1,
          href: '/admin/guide',
        },
      ],
    };
    input.serviceBroadcasts = {
      status: 'OK',
      value: [{ serviceName: '合成サービス', status: 'COMPLETED', count: 1 }],
    };
    input.invoices = { status: 'OK', value: [{ status: 'ISSUED', count: 1 }] };

    const report = buildOpsMorningDigest(input);

    for (const forbidden of [
      'person@example.invalid',
      'U1234567890abcdef1234567890abcdef',
      '550e8400-e29b-41d4-a716-446655440000',
      '12,345円',
      'raw provider exception detail',
      '問い合わせ本文そのもの',
    ]) {
      expect(`${report.subject}\n${report.body}`).not.toContain(forbidden);
    }
  });
});
