'use client';

import { useRef, useState, type FormEvent } from 'react';

type Asset = {
  id: string;
  kind: 'IMAGE' | 'VIDEO' | 'LOGO';
  originalFilename: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: string;
};

const kindLabel = { IMAGE: '写真・画像', VIDEO: '動画', LOGO: 'ロゴ' } as const;

export function VideoAssetUploader({
  workspaceId,
  groupId,
  groupMembershipId,
  initialAssets,
}: {
  workspaceId: string;
  groupId: string;
  groupMembershipId: string;
  initialAssets: Asset[];
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get('file');
    const kind = values.get('kind');
    const usageTerms = values.get('usageTerms');
    if (!(file instanceof File) || file.size === 0) {
      setMessage('アップロードするファイルを選んでください。');
      return;
    }
    if (kind !== 'IMAGE' && kind !== 'VIDEO' && kind !== 'LOGO') return;
    setUploading(true);
    setMessage('安全にアップロードする準備をしています…');
    try {
      const preparedResponse = await fetch(
        `/api/workspaces/${workspaceId}/groups/${groupId}/video-assets`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            groupMembershipId,
            kind,
            originalFilename: file.name,
            declaredMimeType: file.type,
            declaredSizeBytes: file.size,
            rightsConfirmed: values.get('rightsConfirmed') === 'on',
            usageTerms:
              typeof usageTerms === 'string' && usageTerms.trim() ? usageTerms.trim() : null,
          }),
        },
      );
      const prepared = (await preparedResponse.json()) as {
        data?: {
          asset?: { id: string };
          upload?: { method: 'PUT'; uploadUrl: string; headers: Record<string, string> };
        };
        error?: { message?: string };
      };
      if (!preparedResponse.ok || !prepared.data?.asset || !prepared.data.upload)
        throw new Error(prepared.error?.message ?? 'アップロードを準備できませんでした。');

      setMessage('ファイルを送信しています…');
      const sent = await fetch(prepared.data.upload.uploadUrl, {
        method: prepared.data.upload.method,
        headers: prepared.data.upload.headers,
        body: file,
      });
      if (!sent.ok) throw new Error('ファイルを送信できませんでした。もう一度お試しください。');

      setMessage('ファイルの内容を確認しています…');
      const completedResponse = await fetch(
        `/api/workspaces/${workspaceId}/groups/${groupId}/video-assets/${prepared.data.asset.id}/complete`,
        { method: 'POST' },
      );
      const completed = (await completedResponse.json()) as {
        data?: Asset;
        error?: { message?: string };
      };
      if (!completedResponse.ok || !completed.data)
        throw new Error(completed.error?.message ?? 'ファイルの内容を確認できませんでした。');
      setAssets((current) => [completed.data!, ...current]);
      formRef.current?.reset();
      setMessage('素材を保存しました。動画づくりで使えるようになりました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '素材を保存できませんでした。');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <section className="settings-card">
        <h2>新しい素材を追加</h2>
        <p>自分で撮った写真や動画、使用許可のあるロゴを追加できます。</p>
        <form ref={formRef} className="form-stack" onSubmit={(event) => void upload(event)}>
          <label className="field">
            <span className="field__label">素材の種類</span>
            <select className="field__control" name="kind" defaultValue="IMAGE">
              <option value="IMAGE">写真・画像</option>
              <option value="VIDEO">動画</option>
              <option value="LOGO">ロゴ</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">ファイルを選ぶ</span>
            <input
              className="field__control"
              name="file"
              type="file"
              required
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
            />
          </label>
          <p>画像・ロゴは20MBまで、動画は200MBまで・2分以内です。</p>
          <label className="field">
            <span className="field__label">使い方のメモ（任意）</span>
            <textarea
              className="field__control"
              name="usageTerms"
              maxLength={1000}
              placeholder="例：自分のSNS投稿だけで使用できます"
            />
          </label>
          <label className="field">
            <span>
              <input name="rightsConfirmed" type="checkbox" required />
              この素材を使う権利があり、投稿づくりに使ってよいことを確認しました
            </span>
          </label>
          <button className="button" type="submit" disabled={uploading}>
            {uploading ? '保存しています…' : '素材を保存する'}
          </button>
        </form>
        <p role="status" aria-live="polite">
          {message}
        </p>
      </section>

      <section className="settings-card">
        <h2>保存した素材</h2>
        {assets.length === 0 ? <p>保存した素材はまだありません。</p> : null}
        <ul className="plain-list">
          {assets.map((asset) => (
            <li key={asset.id}>
              <strong>{asset.originalFilename}</strong>
              <br />
              {kindLabel[asset.kind]} ／{' '}
              {asset.sizeBytes ? `${(asset.sizeBytes / 1_000_000).toFixed(1)}MB` : '容量不明'}
              {asset.width && asset.height ? ` ／ ${asset.width}×${asset.height}` : ''}
              {asset.durationMs ? ` ／ ${Math.ceil(asset.durationMs / 1000)}秒` : ''}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
