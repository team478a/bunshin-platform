'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  defaultFortuneAppearance,
  fortuneAppearanceSchema,
  resolveFortuneAppearanceColors,
  resolveFortuneSummoningMode,
  type FortuneAppearanceBrand,
  type FortuneAppearanceSettings,
} from '../../../../../src/fortune/appearance';
import type { FortuneGuidanceSettings } from '../../../../../src/fortune/guidance-settings';
import { FortuneAppearance } from '../../fortune-appearance';
import { FortuneCharacterBadge } from '../../fortune-character';

const colors = {
  background: 'ページの背景',
  surface: 'カードの背景',
  text: '本文・見出し',
  action: '主要ボタン',
  accent: '月や星の装飾',
} as const;

const selects = [
  ['backdrop', '背景の演出', { plain: '単色', glow: '上部に淡い光' }],
  ['cards', '鑑定カードの質感', { outline: '枠線', shadow: '影', flat: 'フラット' }],
  ['corners', 'カードの角丸', { square: '小', soft: '中', rounded: '大' }],
  ['ornament', '月や星の装飾', { none: 'なし', moon: '月', stars: '星', both: '月と星' }],
  ['heading', '見出しの書体', { sans: 'ゴシック体', serif: '明朝体' }],
] as const;

const scenes = {
  daily: {
    heading: '今日の占い',
    body: '今、気になっていることを一つ選んでください。',
    action: '今日のカードを引く',
  },
  intake: {
    heading: '相談を整理する',
    body: '今回の鑑定で、何が分かると気持ちを整理できそうですか？',
    action: 'ここまでで占う',
  },
  deep: {
    heading: '深層パーソナル鑑定',
    body: '今できることを一つ選び、自分のペースで考えてみましょう。',
    action: '今日の提案を見る',
  },
} satisfies Record<'daily' | 'intake' | 'deep', { heading: string; body: string; action: string }>;

export function FortuneAppearanceEditor({
  serviceSlug,
  initial,
  brand,
  characters,
}: {
  serviceSlug: string;
  initial: FortuneAppearanceSettings | undefined;
  brand: FortuneAppearanceBrand | undefined;
  characters: FortuneGuidanceSettings['characters'];
}) {
  const router = useRouter();
  const [value, onChange] = useState(initial ?? defaultFortuneAppearance);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [scene, setScene] = useState<keyof typeof scenes>('daily');
  const selected = scenes[scene];
  const character = characters?.[scene];
  const resolvedColors = resolveFortuneAppearanceColors(value, brand);
  function change(key: keyof FortuneAppearanceSettings, nextValue: string | boolean | undefined) {
    const parsed = fortuneAppearanceSchema.safeParse({ ...value, [key]: nextValue });
    if (parsed.success) onChange(parsed.data);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(false);
    try {
      const response = await fetch(`/api/services/${serviceSlug}/fortune-operations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'SAVE_APPEARANCE_SETTINGS', settings: value }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="settings-card">
      <summary>利用者画面のデザイン</summary>
      <form onSubmit={(event) => void save(event)}>
        <fieldset className="form-stack" disabled={busy}>
          <label className="fortune-check">
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(event) => change('enabled', event.target.checked)}
            />
            <span>カスタムデザインを使う（オフの場合は占いの標準デザイン）</span>
          </label>
          <label className="form-field">
            <span>占いの演出</span>
            <select
              value={resolveFortuneSummoningMode(value)}
              onChange={(event) => {
                const mode = event.target.value;
                change('summoning', mode === 'standard' ? 'standard' : mode === 'cinematic');
              }}
            >
              <option value="off">演出なし</option>
              <option value="standard">カード反転のみ</option>
              <option value="cinematic">シネマティック</option>
            </select>
          </label>
          <label className="form-field">
            <span>基本の配色</span>
            <select
              value={value.palette}
              onChange={(event) => change('palette', event.target.value)}
            >
              <option value="light">月と星・生成りと藍</option>
              <option value="night">月と星・夜空と金</option>
            </select>
          </label>
          <label className="fortune-check">
            <input
              type="checkbox"
              checked={value.useBrandColors}
              onChange={(event) => change('useBrandColors', event.target.checked)}
            />
            <span>主要ボタンと装飾にサービスの基本色を使う</span>
          </label>
          <details>
            <summary>色を個別に調整する</summary>
            <p>
              設定した色は基本の配色より優先します。読みづらい文字色は白または黒に補正されます。
            </p>
            {Object.entries(colors).map(([key, label]) => {
              const field = key as keyof typeof colors;
              return (
                <label className="form-field" key={key}>
                  <span>{label}</span>
                  <input
                    type="color"
                    value={resolvedColors[field]}
                    onChange={(event) => change(field, event.target.value)}
                  />
                </label>
              );
            })}
            <button
              className="button button--secondary"
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  background: undefined,
                  surface: undefined,
                  text: undefined,
                  action: undefined,
                  accent: undefined,
                })
              }
            >
              個別の色を解除する
            </button>
          </details>
          {selects.map(([key, label, choices]) => (
            <label key={key} className="form-field">
              <span>{label}</span>
              <select value={value[key]} onChange={(event) => change(key, event.target.value)}>
                {Object.entries(choices).map(([choice, caption]) => (
                  <option key={choice} value={choice}>
                    {caption}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="fortune-check">
            <input
              type="checkbox"
              checked={value.showLogo}
              onChange={(event) => change('showLogo', event.target.checked)}
            />
            <span>サービスのロゴを占い画面に表示する</span>
          </label>
          <label className="form-field">
            <span>スマートフォンプレビューの場面</span>
            <select
              value={scene}
              onChange={(event) => {
                const nextScene = event.target.value;
                if (nextScene === 'daily' || nextScene === 'intake' || nextScene === 'deep')
                  setScene(nextScene);
              }}
            >
              <option value="daily">今日の占い</option>
              <option value="intake">ヒアリング</option>
              <option value="deep">深層鑑定</option>
            </select>
          </label>
          <div className="fortune-appearance-preview" aria-label="スマートフォンプレビュー">
            <FortuneAppearance settings={{ ...value, enabled: true }} brand={brand}>
              <div className="app-page fortune-page">
                <header className="app-page__heading">
                  <h3>{selected.heading}</h3>
                </header>
                <section className="settings-card">
                  {character && <FortuneCharacterBadge character={character} compact />}
                  <p>{selected.body}</p>
                  <span className="button button--primary">{selected.action}</span>
                </section>
              </div>
            </FortuneAppearance>
          </div>
          <button type="submit" className="button button--primary">
            {busy ? '保存中…' : 'デザインを保存'}
          </button>
        </fieldset>
      </form>
      {saved && <p role="status">占いのデザインを保存しました。</p>}
      {error && (
        <p className="form-error" role="alert">
          デザインを保存できませんでした。もう一度お試しください。
        </p>
      )}
    </details>
  );
}
