'use client';
import { useRef, useState, type FormEvent } from 'react';

/** Retain the key and exact payload after an ambiguous network failure. */
export function ImprovementFeedbackForm({ endpoint }: { endpoint: string }) {
  const sending = useRef(false);
  const pending = useRef<{
    submissionKey: string;
    category: string;
    surface: string;
    impact: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || sent) return;
    const values = new FormData(event.currentTarget);
    const selection = (name: string) => {
      const value = values.get(name);
      return typeof value === 'string' ? value : '';
    };
    pending.current ??= {
      submissionKey: crypto.randomUUID(),
      category: selection('category'),
      surface: selection('surface'),
      impact: selection('impact'),
    };
    sending.current = true;
    setBusy(true);
    setLocked(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(pending.current),
      });
      if (!response.ok) throw new Error('feedback not acknowledged');
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== 'object' ||
        !('data' in result) ||
        !result.data ||
        typeof result.data !== 'object' ||
        !('id' in result.data) ||
        typeof result.data.id !== 'string'
      )
        throw new Error('invalid receipt');
      setSent(true);
      setMessage(
        '保存しました。改善の参考にします。個別の返信や即時対応をお約束するものではありません。',
      );
    } catch {
      setMessage(
        '保存完了を確認できませんでした。「同じ内容で再送」で確認できます。画面を閉じる前に再送してください。',
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="service-member-drawer">
      <summary>使っていて困ったことを伝える</summary>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        className="service-member-drawer__content"
      >
        <p>投稿の評価とは別の改善用報告です。写真・文章・個人情報は送信しません。</p>
        <fieldset disabled={locked}>
          <legend>困ったこと</legend>
          <label>
            種類
            <select name="category" defaultValue="OPERATION">
              <option value="OPERATION">操作が分からない・動かない</option>
              <option value="CONTENT">提案内容が合わない</option>
              <option value="WAITING">待ち時間が長い</option>
              <option value="OTHER">その他</option>
            </select>
          </label>
          <label>
            場面
            <select name="surface" defaultValue="TODAY">
              <option value="SETUP">初期設定</option>
              <option value="TODAY">今日の提案</option>
              <option value="PHOTO">写真</option>
              <option value="VIDEO">動画</option>
              <option value="NOTIFICATION">お知らせ</option>
              <option value="OTHER">その他</option>
            </select>
          </label>
          <label>
            困り具合
            <select name="impact" defaultValue="DIFFICULT">
              <option value="BLOCKED">先に進めない</option>
              <option value="DIFFICULT">使いづらい</option>
              <option value="SUGGESTION">改善してほしい</option>
            </select>
          </label>
        </fieldset>
        <button type="submit" disabled={busy || sent}>
          {busy ? '保存中…' : sent ? '保存済み' : locked ? '同じ内容で再送' : '伝える'}
        </button>
        <p role="status" aria-live="polite">
          {message}
        </p>
      </form>
    </details>
  );
}
