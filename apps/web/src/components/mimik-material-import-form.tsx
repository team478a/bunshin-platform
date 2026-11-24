'use client';

import { useState, type FormEvent } from 'react';
import styles from './browser-material.module.css';

export function MimikMaterialImportForm({ workspaceId }: { workspaceId: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    const archive = fields.get('recording');
    const device = fields.get('device');
    if (!(archive instanceof File) || typeof device !== 'string' || fields.get('reviewed') !== 'on')
      return;
    if (!archive.name.toLowerCase().endsWith('.mimik') || archive.size > 8 * 1024 * 1024) {
      setMessage('8 MB 以下の .mimik ファイルを選んでください。');
      return;
    }
    setPending(true);
    setMessage('');
    try {
      const response = await fetch('/api/browser-materials/' + workspaceId + '/import', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/octet-stream',
          'x-mimik-device': device,
          'x-mimik-reviewed': 'true',
        },
        body: archive,
      });
      if (!response.ok) {
        setMessage(
          response.status === 400 || response.status === 413
            ? '読み込めませんでした。Mimik で入力値を除き、30手順・8 MB 以内で書き出してください。'
            : '取り込めませんでした。時間をおいて再試行してください。',
        );
        return;
      }
      const result = (await response.json()) as { id: string };
      window.location.assign(
        '/organizations/' +
          workspaceId +
          '/browser-materials?material=' +
          encodeURIComponent(result.id),
      );
    } catch {
      setMessage('通信に失敗しました。時間をおいて再試行してください。');
    } finally {
      setPending(false);
    }
  }

  return (
    <details>
      <summary>Mimik の操作記録を取り込む</summary>
      <form className={styles.importForm} onSubmit={submit}>
        <label>
          操作記録 <input name="recording" type="file" accept=".mimik" required />
        </label>
        <label>
          記録した端末
          <select name="device">
            <option value="desktop">パソコン</option>
            <option value="mobile">スマートフォン</option>
          </select>
        </label>
        <label>
          <input type="checkbox" name="reviewed" required /> Mimik
          で説明と画像を確認し、個人情報や機密情報を取り除きました。
        </label>
        <button type="submit" disabled={pending}>
          {pending ? '取り込み中' : '自分の教材に取り込む'}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}
