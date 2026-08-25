'use client';

import { useState, type FormEvent } from 'react';

type Version = {
  id: string;
  label: string;
  groupId: string;
  assets: Array<{ id: string; label: string }>;
};
type Campaign = {
  id: string;
  name: string;
  theme: string;
  targetSummary: string;
  participationLimit: number;
  startsAt: string;
  endsAt: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED';
  group: { name: string };
  productPackVersion: { version: number; productPack: { name: string } };
  participations: Array<{ status: string }>;
};

const value = (data: FormData, name: string) => {
  const item = data.get(name);
  return typeof item === 'string' ? item : '';
};

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message ?? '処理できませんでした。');
}

export function CampaignAdminEditor({
  workspaceId,
  initialCampaigns,
  versions,
}: {
  workspaceId: string;
  initialCampaigns: Campaign[];
  versions: Version[];
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [versionId, setVersionId] = useState(versions[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const selected = versions.find((item) => item.id === versionId);
  const reload = async () => {
    const response = await fetch(`/api/workspaces/${workspaceId}/campaigns`, {
      cache: 'no-store',
    });
    setCampaigns(((await response.json()) as { data: Campaign[] }).data);
  };
  const run = async (operation: () => Promise<void>) => {
    setMessage('処理しています…');
    try {
      await operation();
      await reload();
      setMessage('保存しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '処理できませんでした。');
    }
  };
  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const current = selected;
    if (!current) return;
    void run(() =>
      post(`/api/workspaces/${workspaceId}/campaigns`, {
        groupId: current.groupId,
        productPackVersionId: current.id,
        name: value(data, 'name'),
        theme: value(data, 'theme'),
        targetSummary: value(data, 'targetSummary'),
        participationLimit: Number(value(data, 'participationLimit')),
        startsAt: new Date(value(data, 'startsAt')).toISOString(),
        endsAt: new Date(value(data, 'endsAt')).toISOString(),
        assetIds: data
          .getAll('assetIds')
          .filter((item): item is string => typeof item === 'string'),
      }),
    );
  };
  const transition = (campaign: Campaign, to: 'OPEN' | 'CLOSED' | 'CANCELLED') =>
    run(() =>
      post(`/api/workspaces/${workspaceId}/campaigns/${campaign.id}/transition`, {
        from: campaign.status,
        to,
        reason: null,
      }),
    );
  return (
    <>
      <section className="settings-card">
        <h2>新しい募集を下書きする</h2>
        {versions.length === 0 ? (
          <p>先に公式商品パックを公開してください。</p>
        ) : (
          <form onSubmit={create}>
            <label>
              使用する公式商品情報
              <select value={versionId} onChange={(event) => setVersionId(event.target.value)}>
                {versions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              募集名
              <input name="name" required maxLength={160} />
            </label>
            <label>
              発信テーマ
              <textarea name="theme" required maxLength={1000} />
            </label>
            <label>
              参加してほしい人
              <textarea name="targetSummary" required maxLength={1000} />
            </label>
            <label>
              参加できる人数
              <input name="participationLimit" type="number" min="1" max="10000" required />
            </label>
            <label>
              開始日時
              <input name="startsAt" type="datetime-local" required />
            </label>
            <label>
              終了日時
              <input name="endsAt" type="datetime-local" required />
            </label>
            <fieldset>
              <legend>参加者が使える公式素材</legend>
              {selected?.assets.length ? (
                selected.assets.map((asset) => (
                  <label key={asset.id}>
                    <input type="checkbox" name="assetIds" value={asset.id} />
                    {asset.label}
                  </label>
                ))
              ) : (
                <p>この版には素材がありません。</p>
              )}
            </fieldset>
            <button type="submit">下書きを保存する</button>
          </form>
        )}
      </section>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {campaigns.map((campaign) => {
        const accepted = campaign.participations.filter(
          (item) => item.status === 'ACCEPTED',
        ).length;
        return (
          <section className="settings-card" key={campaign.id}>
            <h2>{campaign.name}</h2>
            <p>
              {campaign.group.name} ／ {campaign.productPackVersion.productPack.name} 第
              {campaign.productPackVersion.version}版
            </p>
            <p>{campaign.theme}</p>
            <p>
              参加：{accepted} / {campaign.participationLimit}人 ／ 状態：{campaign.status}
            </p>
            {campaign.status === 'DRAFT' ? (
              <button type="button" onClick={() => void transition(campaign, 'OPEN')}>
                募集を開始する
              </button>
            ) : null}
            {campaign.status === 'OPEN' ? (
              <>
                <button type="button" onClick={() => void transition(campaign, 'CLOSED')}>
                  募集を締め切る
                </button>
                <button
                  type="button"
                  onClick={() =>
                    window.confirm('募集を中止しますか？') && void transition(campaign, 'CANCELLED')
                  }
                >
                  募集を中止する
                </button>
              </>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
