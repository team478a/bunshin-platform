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
    <details className="settings-card fortune-appearance-editor">
      <summary>カードの管理</summary>
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
      <label className="form-field">
        <span>編集するカード</span>
        <select
          value={selected}
          disabled={pending}
          onChange={(event) => {
            setSelected(event.target.value);
            setMessage('');
            setError('');
          }}
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
    </details>
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
  const custom = !standardName;
  const validImage = isFortuneCardImageUrl(imageUrl.trim()) ? imageUrl.trim() : undefined;
  return (
    <form onSubmit={(event) => void save(event)}>
      <fieldset className="form-stack" disabled={busy}>
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
        <p>
          {custom
            ? '正位置・逆位置と3テーマの解釈を入力してください。'
            : '空欄で保存すると、標準の絵柄に戻ります。'}
        </p>
        <p>過去の鑑定に元の絵柄を残す場合は、新しい画像を別のURLで登録してください。</p>
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
        {custom && (
          <>
            {positions.map(({ orientation, theme, key }) => {
              const meaning = meanings.find(
                (item) => item.orientation === orientation && item.theme === theme,
              );
              return (
                <fieldset key={key} className="form-stack">
                  <legend>
                    {orientation === 'UPRIGHT' ? '正位置' : '逆位置'}・{themeLabel(theme)}
                  </legend>
                  <label className="form-field">
                    <span>タイトル</span>
                    <input
                      name={`${key}-title`}
                      defaultValue={meaning?.title}
                      required
                      maxLength={160}
                    />
                  </label>
                  <label className="form-field">
                    <span>カードの解釈</span>
                    <textarea
                      name={`${key}-body`}
                      defaultValue={meaning?.body}
                      required
                      maxLength={700}
                      rows={2}
                    />
                  </label>
                  <label className="form-field">
                    <span>行動の提案</span>
                    <textarea
                      name={`${key}-action`}
                      defaultValue={meaning?.actionStep}
                      required
                      maxLength={200}
                      rows={2}
                    />
                  </label>
                </fieldset>
              );
            })}
            <label className="form-field">
              <span>
                <input type="checkbox" name="enabled" defaultChecked={card?.enabled ?? false} />{' '}
                抽選対象にする
              </span>
            </label>
          </>
        )}
        <button className="button button--primary" type="submit">
          {custom ? '解釈を確認して保存' : 'カード画像を保存'}
        </button>
      </fieldset>
    </form>
  );
}
