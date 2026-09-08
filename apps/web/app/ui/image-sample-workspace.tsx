'use client';
import Image from 'next/image';
import { useState } from 'react';
type SampleResponse = { status: string; error?: { message?: string } };
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
    const bodyLines = form.get('bodyLines');
    if (typeof bodyLines !== 'string') return;
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
          templateKey: form.get('templateKey'),
          headline: form.get('headline'),
          bodyLines: bodyLines
            .split('\n')
            .map((x) => x.trim())
            .filter(Boolean),
          cta: form.get('cta'),
          artDirection: form.get('artDirection'),
        }),
      });
      const data = (await response.json()) as SampleResponse;
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
      const data = (await response.json()) as SampleResponse;
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
          画像の型
          <select
            className="field__control"
            name="templateKey"
            defaultValue="EDITORIAL_COVER"
            disabled={busy}
          >
            <option value="EDITORIAL_COVER">上質な人物入り表紙</option>
            <option value="EMPATHY_QUOTE">シンプルな背景＋文字</option>
          </select>
        </label>
        <label className="field">
          見出し（20文字まで）
          <input
            className="field__control"
            name="headline"
            maxLength={20}
            required
            defaultValue="投稿が続く人は、仕組みを持っている。"
            disabled={busy}
          />
        </label>
        <label className="field">
          補足（人物入り表紙は1行12文字・2行まで）
          <textarea
            className="field__control"
            name="bodyLines"
            required
            rows={3}
            defaultValue={'続ける3つのコツ\n今日から無理なく始める'}
            disabled={busy}
          />
        </label>
        <label className="field">
          最後のひとこと（28文字まで）
          <input
            className="field__control"
            name="cta"
            maxLength={28}
            defaultValue="あとで見返せるように保存"
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
            defaultValue="30〜40代の日本人女性。淡いコーラル色のカーディガンと生成りのブラウス。明るい自宅の仕事机でスマートフォンを持ち、自然に微笑む。清潔感のある上質な雑誌写真。"
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
