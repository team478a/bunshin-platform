'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { FORTUNE_INTAKE_MAX_QUESTIONS, fortuneIntakeOptions } from '@bunshin/capability-fortune';
import {
  defaultFortuneGuide,
  defaultFortuneGuidanceSettings,
  fortuneCharacterExpressions,
  fortuneCharacterRoles,
  type FortuneGuidanceSettings,
} from '../../../../../src/fortune/guidance-settings';

const guideFields = [
  ['introduction', '利用者向けの紹介文'],
  ['personality', '基本の性格・雰囲気'],
  ['language', '言葉遣い'],
  ['readingRules', '鑑定時の表現ルール'],
  ['questionApproach', '質問の進め方'],
  ['suggestionPolicy', '提案内容の方針'],
] as const;

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
  const guide = settings.guide ?? defaultFortuneGuide;
  const intake = fortuneIntakeOptions(settings);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const text = (key: string) => {
      const value = fields.get(key);
      return typeof value === 'string' ? value : '';
    };
    const characters = Object.fromEntries(
      Object.keys(fortuneCharacterRoles).flatMap((role) => {
        const id = text(`${role}.id`).trim();
        const name = text(`${role}.name`).trim();
        const enabled = fields.get(`${role}.enabled`) === 'on';
        const imageUrl = text(`${role}.imageUrl`).trim();
        const iconUrl = text(`${role}.iconUrl`).trim();
        const expressions = Object.fromEntries(
          Object.keys(fortuneCharacterExpressions).map((expression) => [
            expression,
            text(`${role}.${expression}`).trim(),
          ]),
        );
        if (
          !id &&
          !name &&
          !enabled &&
          !imageUrl &&
          !iconUrl &&
          !Object.values(expressions).some(Boolean)
        )
          return [];
        return [[role, { id, name, enabled, imageUrl, iconUrl, expressions }]];
      }),
    );
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
            followUpLimit: Number(text('followUpLimit')),
            deepReadingEnabled: fields.get('deepReadingEnabled') === 'on',
            intake: {
              enabled: fields.get('intakeEnabled') === 'on',
              questions: Number(text('intakeQuestions')),
              calls: Number(text('intakeCalls')),
            },
            guide: {
              ...Object.fromEntries(guideFields.map(([key]) => [key, text(key)])),
              imageUrl: text('imageUrl'),
            },
            characters,
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
          <p>
            案内役はAIとして表示します。紹介や表現ルールには、ご本人の選択を尊重する案内を入力してください。
          </p>
          {guideFields.map(([key, label]) => (
            <label key={key} className="form-field">
              <span>{label}</span>
              <textarea name={key} defaultValue={guide[key]} maxLength={240} rows={2} />
            </label>
          ))}
          <label className="form-field">
            <span>1回の鑑定への追加質問</span>
            <select name="followUpLimit" defaultValue={settings.followUpLimit ?? 2}>
              <option value="0">利用しない</option>
              <option value="1">1回まで</option>
              <option value="2">2回まで</option>
            </select>
          </label>
          <label className="form-field">
            <span>案内役の画像・アイコンURL（HTTPS、任意）</span>
            <input name="imageUrl" type="url" defaultValue={guide.imageUrl} maxLength={500} />
          </label>
          <label className="fortune-check">
            <input type="checkbox" name="intakeEnabled" defaultChecked={intake.enabled} />
            <span>鑑定前の動的ヒアリングを有効にする</span>
          </label>
          <label className="fortune-check">
            <input
              type="checkbox"
              name="deepReadingEnabled"
              defaultChecked={settings.deepReadingEnabled ?? false}
            />
            <span>確認済みの相談を使う深層鑑定を有効にする</span>
          </label>
          <label className="form-field">
            <span>鑑定前の追加質問数（1人・1日あたり）</span>
            <input
              type="number"
              name="intakeQuestions"
              min={1}
              max={FORTUNE_INTAKE_MAX_QUESTIONS}
              defaultValue={intake.questions}
              required
            />
          </label>
          <label className="form-field">
            <span>質問選択のAI利用上限（1人・1日あたり）</span>
            <input
              type="number"
              name="intakeCalls"
              min={1}
              max={FORTUNE_INTAKE_MAX_QUESTIONS}
              defaultValue={intake.calls}
              required
            />
          </label>
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
          <details>
            <summary>画面別のキャラクター</summary>
            <p>配信用のHTTPS画像URLを入力できます。PNG・WebPの透過画像に対応します。</p>
            {Object.entries(fortuneCharacterRoles).map(([role, label]) => {
              const character = settings.characters?.[role as keyof typeof fortuneCharacterRoles];
              return (
                <details key={role} className="settings-card">
                  <summary>{label}</summary>
                  <div className="form-stack">
                    <label className="fortune-check">
                      <input
                        type="checkbox"
                        name={`${role}.enabled`}
                        defaultChecked={character?.enabled}
                      />
                      <span>表示する</span>
                    </label>
                    <label className="form-field">
                      <span>識別ID（半角英小文字・数字・ハイフン・下線）</span>
                      <input
                        name={`${role}.id`}
                        defaultValue={character?.id}
                        maxLength={64}
                        pattern={'[a-z0-9][a-z0-9_\\-]*'}
                      />
                    </label>
                    <label className="form-field">
                      <span>表示名</span>
                      <input name={`${role}.name`} defaultValue={character?.name} maxLength={100} />
                    </label>
                    {(
                      [
                        ['imageUrl', '通常画像'],
                        ['iconUrl', '小型アイコン'],
                      ] as const
                    ).map(([field, title]) => (
                      <label key={field} className="form-field">
                        <span>{title}（任意）</span>
                        <input
                          name={`${role}.${field}`}
                          type="url"
                          defaultValue={character?.[field]}
                          maxLength={500}
                        />
                      </label>
                    ))}
                    {Object.entries(fortuneCharacterExpressions).map(([expression, title]) => (
                      <label key={expression} className="form-field">
                        <span>表情画像・{title}（任意）</span>
                        <input
                          name={`${role}.${expression}`}
                          type="url"
                          defaultValue={
                            character?.expressions[
                              expression as keyof typeof fortuneCharacterExpressions
                            ]
                          }
                          maxLength={500}
                        />
                      </label>
                    ))}
                  </div>
                </details>
              );
            })}
          </details>
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
