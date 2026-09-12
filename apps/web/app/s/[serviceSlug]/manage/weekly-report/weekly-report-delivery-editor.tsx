'use client';

import { useState } from 'react';
import type {
  WeeklyReportDeliverySetting,
  WeeklyReportDeliveryWeekday,
} from '../../../../../src/services/weekly-report-line-delivery';

const weekdays: { value: WeeklyReportDeliveryWeekday; label: string }[] = [
  { value: 'MONDAY', label: '月曜日' },
  { value: 'TUESDAY', label: '火曜日' },
  { value: 'WEDNESDAY', label: '水曜日' },
  { value: 'THURSDAY', label: '木曜日' },
  { value: 'FRIDAY', label: '金曜日' },
  { value: 'SATURDAY', label: '土曜日' },
  { value: 'SUNDAY', label: '日曜日' },
];

export function WeeklyReportDeliveryEditor({
  serviceSlug,
  initialSetting,
  lineReady,
}: {
  serviceSlug: string;
  initialSetting: WeeklyReportDeliverySetting;
  lineReady: boolean;
}) {
  const [setting, setSetting] = useState(initialSetting);
  const [reason, setReason] = useState('週次レポートの配信設定を更新');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/weekly-report-delivery`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...setting, reason }),
        },
      );
      const body = (await response.json()) as {
        data?: WeeklyReportDeliverySetting;
        error?: { message?: string };
      };
      if (!response.ok || !body.data) {
        setMessage(body.error?.message ?? '保存できませんでした。もう一度お試しください。');
        return;
      }
      setSetting(body.data);
      setMessage(body.data.enabled ? '自動配信を開始しました。' : '自動配信を停止しました。');
    } catch {
      setMessage('通信できませんでした。時間をおいてもう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="weekly-report__delivery-form" onSubmit={(event) => void save(event)}>
      <label className="weekly-report__delivery-toggle">
        <input
          type="checkbox"
          checked={setting.enabled}
          onChange={(event) => setSetting({ ...setting, enabled: event.target.checked })}
        />
        毎週LINEで届ける
      </label>
      <div className="weekly-report__delivery-fields">
        <label>
          届ける曜日
          <select
            value={setting.weekday}
            onChange={(event) =>
              setSetting({
                ...setting,
                weekday: event.target.value as WeeklyReportDeliveryWeekday,
              })
            }
          >
            {weekdays.map((weekday) => (
              <option key={weekday.value} value={weekday.value}>
                {weekday.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          届ける時刻
          <input
            type="time"
            min="07:00"
            max="20:59"
            value={setting.localTime}
            onChange={(event) => setSetting({ ...setting, localTime: event.target.value })}
          />
        </label>
      </div>
      <label>
        変更理由
        <input
          value={reason}
          maxLength={1000}
          required
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {!lineReady ? (
        <p className="notice notice--warning">
          LINE設定の接続確認が完了すると配信できます。設定は先に保存できます。
        </p>
      ) : null}
      <button className="button button--primary" type="submit" disabled={saving}>
        {saving ? '保存中…' : '配信設定を保存する'}
      </button>
      <p aria-live="polite" role="status">
        {message}
      </p>
    </form>
  );
}
