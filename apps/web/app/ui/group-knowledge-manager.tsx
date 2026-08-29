'use client';

import { useRef, useState, type FormEvent } from 'react';

type Source = {
  id: string;
  type: 'PDF' | 'VIDEO' | 'URL' | 'TEXT';
  title: string;
  sourceUri: string | null;
  originalFileName: string | null;
  status: 'DRAFT' | 'PROCESSING' | 'REVIEW_REQUIRED' | 'ACTIVE' | 'FAILED' | 'ARCHIVED';
  version: number;
  failureCode: string | null;
  updatedAt: string;
};

const typeLabel = { PDF: 'PDF', VIDEO: '動画', URL: 'Webページ', TEXT: '入力した文章' } as const;
const statusLabel = {
  DRAFT: '読み取り待ち',
  PROCESSING: '読み取り中',
  REVIEW_REQUIRED: '内容の確認待ち',
  ACTIVE: '投稿づくりに利用中',
  FAILED: '読み取りに失敗',
  ARCHIVED: '利用停止',
} as const;

export function GroupKnowledgeManager({
  workspaceId,
  groupId,
  initialSources,
}: {
  workspaceId: string;
  groupId: string;
  initialSources: Source[];
}) {
  const [sources, setSources] = useState(initialSources);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const fileForm = useRef<HTMLFormElement>(null);
  const urlForm = useRef<HTMLFormElement>(null);
  const textForm = useRef<HTMLFormElement>(null);

  const endpoint = `/api/workspaces/${workspaceId}/groups/${groupId}/knowledge`;

  function add(source: Source) {
    setSources((current) => [source, ...current.filter((item) => item.id !== source.id)]);
  }

  async function parse(response: Response) {
    const body = (await response.json()) as {
      data?: {
        source?: Source;
        upload?: { method: 'PUT'; uploadUrl: string; headers: Record<string, string> };
      };
      error?: { message?: string };
    };
    if (!response.ok || !body.data?.source)
      throw new Error(body.error?.message ?? '保存できませんでした。');
    return body.data;
  }

  async function saveFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get('file');
    const title = values.get('title');
    const type = values.get('type');
    if (!(file instanceof File) || file.size === 0 || typeof title !== 'string') return;
    if (type !== 'PDF' && type !== 'VIDEO') return;
    setSaving(true);
    setMessage('安全にアップロードする準備をしています…');
    try {
      const prepared = await parse(
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type,
            title,
            originalFileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            rightsConfirmed: values.get('rightsConfirmed') === 'on',
          }),
        }),
      );
      if (!prepared.upload) throw new Error('アップロードを準備できませんでした。');
      setMessage('ファイルを送信しています…');
      const uploaded = await fetch(prepared.upload.uploadUrl, {
        method: prepared.upload.method,
        headers: prepared.upload.headers,
        body: file,
      });
      if (!uploaded.ok) throw new Error('ファイルを送信できませんでした。');
      setMessage('ファイルが正しいか確認しています…');
      const completed = await fetch(`${endpoint}/${prepared.source!.id}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sizeBytes: file.size }),
      });
      if (!completed.ok) {
        const body = (await completed.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'ファイルを確認できませんでした。');
      }
      add(prepared.source!);
      fileForm.current?.reset();
      setMessage('保存しました。内容の読み取りが始まるまでお待ちください。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  async function saveSimple(event: FormEvent<HTMLFormElement>, type: 'URL' | 'TEXT') {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const title = values.get('title');
    if (typeof title !== 'string') return;
    setSaving(true);
    setMessage('保存しています…');
    try {
      const payload =
        type === 'URL'
          ? { type, title, sourceUri: values.get('sourceUri') }
          : { type, title, content: values.get('content') };
      const saved = await parse(
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
      add(saved.source!);
      (type === 'URL' ? urlForm : textForm).current?.reset();
      setMessage(
        type === 'TEXT'
          ? '保存しました。内容を確認すると投稿づくりに使えます。'
          : '保存しました。Webページの読み取りが始まるまでお待ちください。',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="settings-card">
        <h2>PDF・動画を追加</h2>
        <p>商品資料、よくある質問、研修動画などを選んでください。</p>
        <form ref={fileForm} className="form-stack" onSubmit={(event) => void saveFile(event)}>
          <label className="field">
            <span className="field__label">資料の種類</span>
            <select className="field__control" name="type" defaultValue="PDF">
              <option value="PDF">PDF</option>
              <option value="VIDEO">動画</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">資料の名前</span>
            <input
              className="field__control"
              name="title"
              maxLength={200}
              required
              placeholder="例：商品FAQ 2026年版"
            />
          </label>
          <label className="field">
            <span className="field__label">ファイル</span>
            <input
              className="field__control"
              name="file"
              type="file"
              accept="application/pdf,video/mp4,video/quicktime"
              required
            />
          </label>
          <p>
            PDFは50MBまで、動画は200MBまでです。社外秘資料を登録できる権限があることを確認してください。
          </p>
          <label className="field">
            <span>
              <input name="rightsConfirmed" type="checkbox" required />
              この資料を登録し、投稿づくりに利用できる権限があることを確認しました
            </span>
          </label>
          <button className="button" type="submit" disabled={saving}>
            資料を保存する
          </button>
        </form>
      </section>

      <section className="settings-card">
        <h2>公式Webページを追加</h2>
        <p>商品ページや公開FAQのURLを登録できます。</p>
        <form
          ref={urlForm}
          className="form-stack"
          onSubmit={(event) => void saveSimple(event, 'URL')}
        >
          <label className="field">
            <span className="field__label">資料の名前</span>
            <input className="field__control" name="title" maxLength={200} required />
          </label>
          <label className="field">
            <span className="field__label">WebページのURL</span>
            <input
              className="field__control"
              name="sourceUri"
              type="url"
              inputMode="url"
              required
              placeholder="https://example.jp/faq"
            />
          </label>
          <button className="button" type="submit" disabled={saving}>
            Webページを保存する
          </button>
        </form>
      </section>

      <section className="settings-card">
        <h2>文章を直接追加</h2>
        <p>短いFAQや社内で決めた説明文は、そのまま入力できます。</p>
        <form
          ref={textForm}
          className="form-stack"
          onSubmit={(event) => void saveSimple(event, 'TEXT')}
        >
          <label className="field">
            <span className="field__label">資料の名前</span>
            <input className="field__control" name="title" maxLength={200} required />
          </label>
          <label className="field">
            <span className="field__label">内容</span>
            <textarea
              className="field__control"
              name="content"
              maxLength={8000}
              rows={8}
              required
              placeholder="例：Q. 返品できますか？ A. 商品到着後7日以内に…"
            />
          </label>
          <button className="button" type="submit" disabled={saving}>
            文章を保存する
          </button>
        </form>
      </section>

      <p role="status" aria-live="polite">
        {message}
      </p>

      <section className="settings-card">
        <h2>保存したナレッジ</h2>
        {sources.length === 0 ? <p>保存した資料はまだありません。</p> : null}
        <ul className="plain-list">
          {sources.map((source) => (
            <li key={source.id}>
              <strong>{source.title}</strong>
              <br />
              {typeLabel[source.type]} ／ {statusLabel[source.status]} ／ 第{source.version}版
              {source.originalFileName ? (
                <>
                  <br />
                  ファイル：{source.originalFileName}
                </>
              ) : null}
              {source.sourceUri ? (
                <>
                  <br />
                  登録先：{source.sourceUri}
                </>
              ) : null}
              {source.failureCode ? (
                <>
                  <br />
                  確認が必要です：{source.failureCode}
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
