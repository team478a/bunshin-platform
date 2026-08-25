'use client';

import { useState } from 'react';

type Campaign = {
  id: string;
  name: string;
  theme: string;
  targetSummary: string;
  endsAt: string;
  participationLimit: number;
  group: { name: string };
  productPackVersion: { productPack: { name: string } };
  assets: Array<{
    productPackAsset: { id: string; label: string; url: string; usageTerms: string };
  }>;
  participations: Array<{ status: string }>;
};

export function CampaignParticipationEditor({
  workspaceId,
  bunshinId,
  initialCampaigns,
}: {
  workspaceId: string;
  bunshinId: string;
  initialCampaigns: Campaign[];
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [message, setMessage] = useState('');
  const base = `/api/workspaces/${workspaceId}/bunshins/${bunshinId}/campaigns`;
  const decide = async (campaignId: string, decision: string) => {
    setMessage('保存しています…');
    const response = await fetch(`${base}/${campaignId}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision, reason: null }),
    });
    if (!response.ok) {
      setMessage('処理できませんでした。募集期間や人数をご確認ください。');
      return;
    }
    const refreshed = await fetch(base, { cache: 'no-store' });
    setCampaigns(((await refreshed.json()) as { data: Campaign[] }).data);
    setMessage('選択を保存しました。');
  };
  return (
    <>
      {campaigns.length === 0 ? (
        <p>いま参加できる募集はありません。</p>
      ) : (
        campaigns.map((campaign) => {
          const status = campaign.participations[0]?.status;
          return (
            <section className="settings-card" key={campaign.id}>
              <p className="eyebrow">{campaign.group.name}</p>
              <h2>{campaign.name}</h2>
              <p>{campaign.theme}</p>
              <p>こんな人向け：{campaign.targetSummary}</p>
              <p>商品：{campaign.productPackVersion.productPack.name}</p>
              <p>締切：{new Date(campaign.endsAt).toLocaleString('ja-JP')}</p>
              {campaign.assets.length ? (
                <>
                  <h3>使える公式素材</h3>
                  <ul>
                    {campaign.assets.map(({ productPackAsset: asset }) => (
                      <li key={asset.id}>
                        <a href={asset.url} target="_blank" rel="noreferrer">
                          {asset.label}
                        </a>
                        <p>{asset.usageTerms}</p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p>
                あなたの選択：
                {status === 'ACCEPTED'
                  ? '参加する'
                  : status === 'DECLINED'
                    ? '今回は参加しない'
                    : status === 'ON_HOLD'
                      ? 'あとで決める'
                      : status === 'WITHDRAWN'
                        ? '参加を取り消した'
                        : 'まだ選んでいません'}
              </p>
              <button type="button" onClick={() => void decide(campaign.id, 'ACCEPTED')}>
                参加する
              </button>
              <button type="button" onClick={() => void decide(campaign.id, 'ON_HOLD')}>
                あとで決める
              </button>
              <button type="button" onClick={() => void decide(campaign.id, 'DECLINED')}>
                今回は参加しない
              </button>
              {status === 'ACCEPTED' ? (
                <button type="button" onClick={() => void decide(campaign.id, 'WITHDRAWN')}>
                  参加を取り消す
                </button>
              ) : null}
            </section>
          );
        })
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
    </>
  );
}
