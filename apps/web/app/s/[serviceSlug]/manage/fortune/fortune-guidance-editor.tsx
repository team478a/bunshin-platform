'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  defaultFortuneGuidanceSettings,
  type FortuneGuidanceSettings,
} from '../../../../../src/fortune/guidance-settings';

export function FortuneGuidanceEditor({
  serviceSlug,
  settings,
}: {
  serviceSlug: string;
  settings: FortuneGuidanceSettings;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const text = (key: string) => {
      const value = fields.get(key);
      return typeof value === 'string' ? value : '';
    };
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/services/${serviceSlug}/fortune-operations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'SAVE_GUIDANCE_SETTINGS',
          settings: {
            interestQuestion: text('interestQuestion'),
            consultationQuestion: text('consultationQuestion'),
            styleQuestion: text('styleQuestion'),
            guideName: text('guideName'),
            defaultStyle: text('defaultStyle') || null,
            themeLabels: Object.fromEntries(
              Object.keys(settings.themeLabels).map((key) => [key, text(key)]),
            ),
            styleLabels: Object.fromEntries(
              Object.keys(settings.styleLabels).map((key) => [key, text(key)]),
            ),
          },
        }),
      });
      if (!response.ok) {
        setError('設定を保存できませんでした。入力内容を確認してください。');
        return;
      }
      setMessage('鑑定の案内設定を保存しました。');
      router.refresh();
    } catch {
      setError('通信できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="settings-card">
      <summary>ヒアリングとAI案内役の設定</summary>
      <form className="form-stack" onSubmit={(event) => void save(event)}>
        <fieldset className="form-stack" disabled={busy}>
          {(
            [
              ['interestQuestion', '関心を聞く質問'],
              ['consultationQuestion', '希望を聞く質問'],
              ['styleQuestion', '鑑定スタイルを聞く質問'],
              ['guideName', 'AI案内役の表示名'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="form-field">
              <span>{label}</span>
              <input name={key} defaultValue={settings[key]} maxLength={100} required />
            </label>
          ))}
          {Object.entries(settings.themeLabels).map(([key, value]) => (
            <label key={key} className="form-field">
              <span>
                テーマ表示名（
                {
                  defaultFortuneGuidanceSettings.themeLabels[
                    key as keyof FortuneGuidanceSettings['themeLabels']
                  ]
                }
                ）
              </span>
              <input name={key} defaultValue={value} maxLength={100} required />
            </label>
          ))}
          {Object.entries(settings.styleLabels).map(([key, value]) => (
            <label key={key} className="form-field">
              <span>
                スタイル表示名（
                {
                  defaultFortuneGuidanceSettings.styleLabels[
                    key as keyof FortuneGuidanceSettings['styleLabels']
                  ]
                }
                ）
              </span>
              <input name={key} defaultValue={value} maxLength={100} required />
            </label>
          ))}
          <label className="form-field">
            <span>本人の希望がない場合のスタイル</span>
            <select name="defaultStyle" defaultValue={settings.defaultStyle ?? ''}>
              <option value="">標準</option>
              {Object.entries(settings.styleLabels).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="button button--primary">
            {busy ? '保存中…' : '案内設定を保存'}
          </button>
        </fieldset>
      </form>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
