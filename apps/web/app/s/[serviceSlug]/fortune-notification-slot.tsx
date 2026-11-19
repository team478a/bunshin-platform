'use client';

import { useState, type FormEvent } from 'react';

export function FortuneNotificationSlot({
  serviceSlug,
  slot,
  defaultWeekday,
  defaultHour,
}: {
  serviceSlug: string;
  slot: { weekday: number; hour: number } | null;
  defaultWeekday: number;
  defaultHour: number;
}) {
  const [custom, setCustom] = useState(slot !== null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/services/${serviceSlug}/fortune/notification-slot`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slot: custom
            ? { weekday: Number(fields.get('weekday')), hour: Number(fields.get('hour')) }
            : null,
        }),
      });
      if (!response.ok) {
        setError('曜日と時刻を保存できませんでした。');
        return;
      }
      setMessage('通知の曜日と時刻を保存しました。');
    } catch {
      setError('通信できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="fortune-action" onSubmit={(event) => void save(event)}>
      <fieldset disabled={busy} className="fortune-action">
        <label className="fortune-check">
          <input
            type="checkbox"
            checked={custom}
            onChange={(event) => setCustom(event.target.checked)}
          />
          <span>受け取る曜日と時刻を指定する</span>
        </label>
        {custom && (
          <div className="button-row">
            <label className="form-field">
              <span>曜日</span>
              <select name="weekday" defaultValue={slot?.weekday ?? defaultWeekday}>
                {['日', '月', '火', '水', '木', '金', '土'].map((day, weekday) => (
                  <option key={day} value={weekday}>
                    {day}曜日
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>時刻</span>
              <select name="hour" defaultValue={slot?.hour ?? defaultHour}>
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {hour}時ごろ
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <button type="submit" className="button button--secondary">
          {busy ? '保存中…' : '曜日と時刻を保存'}
        </button>
      </fieldset>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
