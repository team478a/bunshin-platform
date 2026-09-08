'use client';
import Image from 'next/image';
import { useState } from 'react';
export function ImageSampleWorkspace({
  groupId,
  bunshins,
  samples,
}: {
  groupId: string;
  bunshins: Array<{ id: string; name: string }>;
  samples: Array<{ id: string; status: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [items, setItems] = useState(samples);
  const [attempt, setAttempt] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const id = attempt ?? crypto.randomUUID();
    setAttempt(id);
    setBusy(true);
    setMessage('画像を作っています。1〜2分ほどかかります。');
    try {
      const response = await fetch('/api/admin/image-samples', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id,
          groupId,
          bunshinId: form.get('bunshinId'),
          headline: form.get('headline'),
          bodyLines: String(form.get('bodyLines'))
            .split('\n')
            .map((x) => x.trim())
            .filter(Boolean),
          cta: form.get('cta'),
          artDirection: form.get('artDirection'),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error?.message ?? '作成できませんでした。');
        setAttempt(null);
        return;
      }
      setItems((current) => [
        { id, status: data.status },
        ...current.filter((item) => item.id !== id),
      ]);
      setMessage(
        data.status === 'READY'
          ? '画像ができました。文字と雰囲気をご確認ください。'
          : 'この作成は受付済みです。状況を確認してください。',
      );
      if (data.status === 'READY' || data.status === 'FAILED') setAttempt(null);
    } catch {
      setMessage('通信が途切れました。同じ入力のまま再確認すると、重複作成せず状況を取得します。');
    } finally {
      setBusy(false);
    }
  }
  async function refresh(id: string) {
    try {
      const response = await fetch(`/api/admin/image-samples/${id}`);
      if (!response.ok) return;
      const data = await response.json();
      setItems((current) =>
        current.map((item) => (item.id === id ? { id, status: data.status } : item)),
      );
      if (data.status !== 'GENERATING') setAttempt(null);
    } catch {
      setMessage('状況を取得できませんでした。少し待ってお試しください。');
    }
  }
  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/image-samples/${id}`, { method: 'DELETE' });
      if (response.ok) setItems((current) => current.filter((item) => item.id !== id));
      else setMessage('削除できませんでした。時間をおいてお試しください。');
    } catch {
      setMessage('削除の通信に失敗しました。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ maxWidth: 720 }}>
      <form className="form-stack settings-card" onSubmit={(event) => void submit(event)}>
        <label className="field">
          投稿パートナー
          <select className="field__control" name="bunshinId" disabled={busy}>
            {bunshins.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          見出し（20文字まで）
          <input
            className="field__control"
            name="headline"
            maxLength={20}
            required
            defaultValue="知識を、つながりに。"
            disabled={busy}
          />
        </label>
        <label className="field">
          本文（1行28文字・3行まで）
          <textarea
            className="field__control"
            name="bodyLines"
            required
            rows={3}
            defaultValue={'千ノ国メディア\nあなたの経験が、誰かの一歩に。\n学びと実践を、一緒に。'}
            disabled={busy}
          />
        </label>
        <label className="field">
          最後のひとこと（28文字まで）
          <input
            className="field__control"
            name="cta"
            maxLength={28}
            defaultValue="あなたの知識を、発信しよう。"
            disabled={busy}
          />
        </label>
        <label className="field">
          画像の雰囲気
          <textarea
            className="field__control"
            name="artDirection"
            minLength={10}
            maxLength={1000}
            required
            rows={4}
            defaultValue="知識が人から人へ伝わり、小さな実践につながる様子。深い紺色と温かい金色を使った、落ち着いた上質な紙のイラスト。開いた本から細い光が伸び、周囲の小さな人々や街の窓へつながる。中央は文章が読めるよう余白を残す。実在人物の写真やロゴは使わない。"
            disabled={busy}
          />
        </label>
        <button className="button button--primary" disabled={busy}>
          {busy ? '画像を作っています…' : attempt ? '作成状況を再確認' : '投稿画像を1枚作る'}
        </button>
      </form>
      <p role="status">{message}</p>
      {items.map((item) => (
        <section className="settings-card" key={item.id}>
          {item.status === 'READY' ? (
            <>
              <Image
                src={`/api/admin/image-samples/${item.id}?download=1`}
                alt="試作した投稿画像"
                width={1080}
                height={1350}
                unoptimized
                style={{ width: '100%', height: 'auto' }}
              />
              <p>
                <a
                  href={`/api/admin/image-samples/${item.id}?download=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  画像を開く・保存する
                </a>
              </p>
            </>
          ) : (
            <>
              <p>
                {item.status === 'FAILED' ? 'この画像は作成に失敗しました。' : '画像を作成中です。'}
              </p>
              <button onClick={() => void refresh(item.id)}>状況を確認する</button>
            </>
          )}
          {item.status !== 'GENERATING' ? (
            <button disabled={busy} onClick={() => void remove(item.id)}>
              この試作画像を削除する
            </button>
          ) : null}
        </section>
      ))}
    </div>
  );
}
