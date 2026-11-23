'use client';

import {
  FORTUNE_ORIENTATIONS,
  FORTUNE_THEMES,
  isFortuneCardImageUrl,
  TAROT_DECK,
  type FortuneDeckCard,
  type FortuneKnowledgeMeaningInput,
} from '@bunshin/capability-fortune';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { FortuneDeckChange } from '../../../../../src/fortune/deck-settings';
import { FortuneCardArtwork, FortuneCardBack } from '../../fortune-card-artwork';
import { themeLabel } from '../../fortune-ui';

const newCard = 'new';
const previewCards = TAROT_DECK.filter((card) =>
  ['MAJOR_17', 'MAJOR_18', 'MAJOR_19'].includes(card.code),
);
const positions = FORTUNE_ORIENTATIONS.flatMap((orientation) =>
  FORTUNE_THEMES.map((theme) => ({ orientation, theme, key: `${orientation}-${theme}` })),
);
const orientationLabel = (orientation: (typeof FORTUNE_ORIENTATIONS)[number]) =>
  orientation === 'UPRIGHT' ? '正位置' : '逆位置';
const meaningFields = ['title', 'body', 'action'] as const;

function missingMeaningField(form: FormData, key: string) {
  return meaningFields
    .map((field) => `${key}-${field}`)
    .find((field) => {
      const value = form.get(field);
      return typeof value !== 'string' || !value.trim();
    });
}

export function FortuneDeckEditor({
  serviceSlug,
  version,
  deck,
  meanings,
}: {
  serviceSlug: string;
  version: number;
  deck: FortuneDeckCard[];
  meanings: FortuneKnowledgeMeaningInput[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState('MAJOR_18');
  const [busy, setBusy] = useState(false);
  const [savedVersion, setSavedVersion] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pending = busy || savedVersion > version;
  const standard = TAROT_DECK.find((card) => card.code === selected);
  const savedCard = deck.find((card) => card.code === selected);

  function selectCard(code: string) {
    setSelected(code);
    setMessage('');
    setError('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const field = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value.trim() : '';
    };
    const change: FortuneDeckChange = standard
      ? { kind: 'standard', code: standard.code, imageUrl: field('imageUrl') }
      : {
          kind: 'custom',
          ...(savedCard ? { code: savedCard.code } : {}),
          nameJa: field('nameJa'),
          imageUrl: field('imageUrl'),
          enabled: form.has('enabled'),
          meanings: positions.map(({ orientation, theme, key }) => ({
            orientation,
            theme,
            title: field(`${key}-title`),
            body: field(`${key}-body`),
            actionStep: field(`${key}-action`),
          })),
        };
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/services/${serviceSlug}/fortune-operations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'SAVE_DECK_CARD', expectedVersion: version, change }),
      });
      const result = (await response.json()) as {
        data?: { code: string; version: number };
        error?: { message?: string };
      };
      if (!response.ok || !result.data) {
        setError(result.error?.message || 'カードを保存できませんでした。');
        return;
      }
      setSavedVersion(result.data.version);
      setSelected(result.data.code);
      setMessage('カードを保存しました。');
      router.refresh();
    } catch {
      setError('カードを保存できませんでした。通信をご確認ください。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card fortune-deck-editor">
      <header className="fortune-deck-editor__header">
        <h2>カードの管理</h2>
        <button
          type="button"
          className="button button--secondary"
          disabled={pending || selected === newCard}
          onClick={() => selectCard(newCard)}
        >
          独自カードを追加
        </button>
      </header>
      <details className="fortune-deck-editor__examples">
        <summary>カードのデザイン見本</summary>
        <div className="fortune-deck-preview" aria-label="カードのデザイン見本">
          <figure>
            <FortuneCardBack />
            <figcaption>裏面</figcaption>
          </figure>
          {previewCards.map((card) => (
            <figure key={card.code}>
              <FortuneCardArtwork
                card={{ cardCode: card.code, cardNameJa: card.nameJa, orientation: 'UPRIGHT' }}
              />
              <figcaption>{card.nameJa}</figcaption>
            </figure>
          ))}
        </div>
      </details>
      <label className="form-field fortune-deck-editor__picker">
        <span>編集するカード</span>
        <select
          value={selected}
          disabled={pending}
          onChange={(event) => selectCard(event.target.value)}
        >
          <option value={newCard}>独自カードを追加</option>
          <optgroup label="標準カード">
            {TAROT_DECK.map((card) => (
              <option key={card.code} value={card.code}>
                {card.nameJa}
              </option>
            ))}
          </optgroup>
          <optgroup label="独自カード">
            {deck
              .filter((card) => card.code.startsWith('CUSTOM_'))
              .map((card) => (
                <option key={card.code} value={card.code}>
                  {card.nameJa}
                  {card.enabled ? '' : '（抽選対象外）'}
                </option>
              ))}
          </optgroup>
        </select>
      </label>
      <CardForm
        key={`${selected}:${version}`}
        code={selected}
        standardName={standard?.nameJa}
        card={savedCard}
        meanings={meanings.filter((meaning) => meaning.cardCode === selected)}
        busy={pending}
        save={save}
      />
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function CardForm({
  code,
  standardName,
  card,
  meanings,
  busy,
  save,
}: {
  code: string;
  standardName: string | undefined;
  card: FortuneDeckCard | undefined;
  meanings: FortuneKnowledgeMeaningInput[];
  busy: boolean;
  save: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const [imageUrl, setImageUrl] = useState(card?.imageUrl ?? '');
  const [orientation, setOrientation] = useState<(typeof FORTUNE_ORIENTATIONS)[number]>('UPRIGHT');
  const [theme, setTheme] = useState<(typeof FORTUNE_THEMES)[number]>('LOVE');
  const [complete, setComplete] = useState<string[]>(() =>
    meanings
      .filter(({ title, body, actionStep }) => title.trim() && body.trim() && actionStep.trim())
      .map((meaning) => `${meaning.orientation}-${meaning.theme}`),
  );
  const [missingField, setMissingField] = useState('');
  const custom = !standardName;
  const activeKey = `${orientation}-${theme}`;
  const validImage = isFortuneCardImageUrl(imageUrl.trim()) ? imageUrl.trim() : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    if (custom) {
      const element = event.currentTarget;
      const data = new FormData(element);
      for (const position of positions) {
        const field = missingMeaningField(data, position.key);
        if (!field) continue;
        event.preventDefault();
        setOrientation(position.orientation);
        setTheme(position.theme);
        setMissingField(field);
        requestAnimationFrame(() => {
          const control = element.elements.namedItem(field);
          if (control instanceof HTMLElement) control.focus();
        });
        return;
      }
    }
    void save(event);
  }

  return (
    <form
      onSubmit={submit}
      onInput={(event) => {
        if (!custom) return;
        const data = new FormData(event.currentTarget);
        setComplete(
          positions.filter(({ key }) => !missingMeaningField(data, key)).map(({ key }) => key),
        );
        if (missingField) {
          const value = data.get(missingField);
          if (typeof value === 'string' && value.trim()) setMissingField('');
        }
      }}
    >
      <fieldset className="fortune-deck-editor__fields" disabled={busy}>
        <div className="fortune-deck-editor__identity">
          <div className="fortune-deck-editor__metadata">
            {custom && (
              <label className="form-field">
                <span>カード名</span>
                <input name="nameJa" defaultValue={card?.nameJa} required maxLength={50} />
              </label>
            )}
            <label className="form-field">
              <span>絵柄の公開HTTPS画像URL</span>
              <input
                name="imageUrl"
                type="url"
                required={custom}
                maxLength={1000}
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
              />
            </label>
            {!custom && <p>空欄で保存すると、標準の絵柄に戻ります。</p>}
            <p>過去の鑑定に元の絵柄を残す場合は、新しい画像を別のURLで登録してください。</p>
          </div>
          {(validImage || standardName) && (
            <div className="fortune-deck-current" aria-label="選択したカードのプレビュー">
              <FortuneCardArtwork
                card={{
                  cardCode: code,
                  cardNameJa: standardName ?? card?.nameJa ?? '新しいカード',
                  orientation: 'UPRIGHT',
                  ...(validImage ? { cardImageUrl: validImage } : {}),
                }}
              />
            </div>
          )}
        </div>
        {custom && (
          <div className="fortune-deck-editor__meanings">
            <div className="fortune-deck-editor__meaning-heading">
              <h3>カードの解釈</h3>
              <span aria-live="polite">{complete.length} / 6 入力済み</span>
            </div>
            <div className="fortune-deck-editor__filters">
              <div className="fortune-deck-editor__toggle" role="group" aria-label="カードの向き">
                {FORTUNE_ORIENTATIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={orientation === value}
                    onClick={() => setOrientation(value)}
                  >
                    {orientationLabel(value)}
                  </button>
                ))}
              </div>
              <div className="fortune-deck-editor__toggle" role="group" aria-label="占いのテーマ">
                {FORTUNE_THEMES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={theme === value}
                    onClick={() => setTheme(value)}
                  >
                    {themeLabel(value)}
                  </button>
                ))}
              </div>
            </div>
            {positions.map(({ orientation, theme, key }) => {
              const meaning = meanings.find(
                (item) => item.orientation === orientation && item.theme === theme,
              );
              return (
                <fieldset
                  key={key}
                  className="fortune-deck-editor__meaning"
                  hidden={key !== activeKey}
                >
                  <legend>
                    {orientationLabel(orientation)}・{themeLabel(theme)}
                  </legend>
                  <label className="form-field">
                    <span>タイトル</span>
                    <input
                      name={`${key}-title`}
                      defaultValue={meaning?.title}
                      aria-required="true"
                      aria-invalid={missingField === `${key}-title`}
                      maxLength={160}
                    />
                  </label>
                  <label className="form-field">
                    <span>カードの解釈</span>
                    <textarea
                      name={`${key}-body`}
                      defaultValue={meaning?.body}
                      aria-required="true"
                      aria-invalid={missingField === `${key}-body`}
                      maxLength={700}
                      rows={2}
                    />
                  </label>
                  <label className="form-field">
                    <span>行動の提案</span>
                    <textarea
                      name={`${key}-action`}
                      defaultValue={meaning?.actionStep}
                      aria-required="true"
                      aria-invalid={missingField === `${key}-action`}
                      maxLength={200}
                      rows={2}
                    />
                  </label>
                </fieldset>
              );
            })}
            {missingField && (
              <p className="form-error" role="alert">
                保存するには、6通りすべての解釈を入力してください。
              </p>
            )}
          </div>
        )}
        <div className="fortune-deck-editor__footer">
          {custom && (
            <label>
              <input type="checkbox" name="enabled" defaultChecked={card?.enabled ?? false} />{' '}
              抽選対象にする
            </label>
          )}
          <button className="button button--primary" type="submit">
            {custom ? '解釈を確認して保存' : 'カード画像を保存'}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
