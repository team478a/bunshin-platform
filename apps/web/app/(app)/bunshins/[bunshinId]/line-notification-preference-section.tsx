'use client';
import { useState, type FormEvent } from 'react';

export type LineNotificationPreferenceView = {
  enabled: boolean;
  consentGranted: boolean;
  localTime: string;
  timezone: string;
  frequency: 'DAILY' | 'WEEKDAYS';
  quietHoursStart: string;
  quietHoursEnd: string;
  pausedUntil: string | null;
  reminderEnabled: boolean;
};

export function LineNotificationPreferenceSection(props: {
  workspaceId: string;
  bunshinId: string;
  preference: LineNotificationPreferenceView;
}) {
  const localPause = props.preference.pausedUntil
    ? new Date(props.preference.pausedUntil).toLocaleString('sv-SE').replace(' ', 'T').slice(0, 16)
    : null;
  const [value, setValue] = useState({ ...props.preference, pausedUntil: localPause });
  const [message, setMessage] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    const endpoint = `/api/workspaces/${encodeURIComponent(props.workspaceId)}/bunshins/${encodeURIComponent(props.bunshinId)}/line-notification-preference`;
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...value,
        pausedUntil: value.pausedUntil ? new Date(value.pausedUntil).toISOString() : null,
      }),
    });
    setMessage(response.ok ? '通知設定を保存しました。' : '通知設定を保存できませんでした。');
  }
  return (
    <section>
      <h2>LINE通知設定</h2>
      <p>LINEとつながった後、何時ごろにお知らせを受け取るか決められます。</p>
      <form onSubmit={(event) => void save(event)}>
        <label>
          <input
            type="checkbox"
            checked={value.consentGranted}
            onChange={(event) =>
              setValue({
                ...value,
                consentGranted: event.target.checked,
                enabled: event.target.checked ? value.enabled : false,
              })
            }
          />
          LINE通知に同意する
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.enabled}
            disabled={!value.consentGranted}
            onChange={(event) => setValue({ ...value, enabled: event.target.checked })}
          />
          今日やることをLINEで知らせる
        </label>
        <label>
          通知時刻
          <input
            type="time"
            value={value.localTime}
            onChange={(e) => setValue({ ...value, localTime: e.target.value })}
          />
        </label>
        <label>
          タイムゾーン
          <input
            value={value.timezone}
            onChange={(e) => setValue({ ...value, timezone: e.target.value })}
          />
        </label>
        <label>
          頻度
          <select
            value={value.frequency}
            onChange={(e) =>
              setValue({ ...value, frequency: e.target.value as 'DAILY' | 'WEEKDAYS' })
            }
          >
            <option value="DAILY">毎日</option>
            <option value="WEEKDAYS">平日のみ</option>
          </select>
        </label>
        <fieldset>
          <legend>通知しない時間帯</legend>
          <input
            type="time"
            value={value.quietHoursStart}
            onChange={(e) => setValue({ ...value, quietHoursStart: e.target.value })}
            aria-label="通知停止開始"
          />
          <span>〜</span>
          <input
            type="time"
            value={value.quietHoursEnd}
            onChange={(e) => setValue({ ...value, quietHoursEnd: e.target.value })}
            aria-label="通知停止終了"
          />
        </fieldset>
        <label>
          一時停止期限
          <input
            type="datetime-local"
            value={value.pausedUntil ?? ''}
            onChange={(e) => setValue({ ...value, pausedUntil: e.target.value || null })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.reminderEnabled}
            onChange={(e) => setValue({ ...value, reminderEnabled: e.target.checked })}
          />
          Reminderを有効にする（1日最大1回）
        </label>
        <button type="submit">通知設定を保存</button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
