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
  maxRelatedPerWeek: number;
  maxAdsPerWeek: number;
  cooldownDays: number;
  generationLimitPerParticipant: number;
  similarityThresholdBasisPoints: number;
  startsAt: string;
  endsAt: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED';
  group: { name: string };
  productPackVersion: { version: number; productPack: { name: string } };
  participations: Array<{ status: string }>;
  metrics: {
    generated: number;
    accepted: number;
    copied: number;
    posted: number;
    feedbackGood: number;
    duplicateRejected: number;
  };
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
  apiBase,
}: {
  workspaceId: string;
  initialCampaigns: Campaign[];
  versions: Version[];
  apiBase?: string;
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [versionId, setVersionId] = useState(versions[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const selected = versions.find((item) => item.id === versionId);
  const reload = async () => {
    const response = await fetch(apiBase ?? `/api/workspaces/${workspaceId}/campaigns`, {
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
      post(apiBase ?? `/api/workspaces/${workspaceId}/campaigns`, {
        groupId: current.groupId,
        productPackVersionId: current.id,
        name: value(data, 'name'),
        theme: value(data, 'theme'),
        targetSummary: value(data, 'targetSummary'),
        participationLimit: Number(value(data, 'participationLimit')),
        maxRelatedPerWeek: Number(value(data, 'maxRelatedPerWeek')),
        maxAdsPerWeek: Number(value(data, 'maxAdsPerWeek')),
        cooldownDays: Number(value(data, 'cooldownDays')),
        generationLimitPerParticipant: Number(value(data, 'generationLimitPerParticipant')),
        similarityThresholdBasisPoints: Number(value(data, 'similarityThresholdBasisPoints')),
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
      post(`${apiBase ?? `/api/workspaces/${workspaceId}/campaigns`}/${campaign.id}/transition`, {
        from: campaign.status,
        to,
        reason: null,
      }),
    );
  return (
    <>
      <section className="settings-card campaign-create-card">
        <div className="campaign-heading">
          <div>
            <p className="eyebrow">1. 参加者へ案内する企画を作る</p>
            <h2>新しい募集を下書きする</h2>
          </div>
        </div>
        <p>
          商品情報を選び、参加者へ案内する企画を作ります。保存後に内容を確認して募集を開始します。
        </p>
        {versions.length === 0 ? (
          <p className="notice notice--danger">先に公式商品情報を公開してください。</p>
        ) : (
          <form className="form-stack campaign-form" onSubmit={create}>
            <label className="field">
              <span className="field__label">使用する公式商品情報</span>
              <select
                className="field__control"
                value={versionId}
                onChange={(event) => setVersionId(event.target.value)}
              >
                {versions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">募集名</span>
              <input
                className="field__control"
                name="name"
                required
                maxLength={160}
                placeholder="例：9月のSNS発信チャレンジ"
              />
            </label>
            <label className="field">
              <span className="field__label">発信テーマ</span>
              <textarea
                className="field__control"
                name="theme"
                required
                maxLength={1000}
                rows={3}
                placeholder="例：初心者でも続けやすいSNS発信のコツ"
              />
            </label>
            <label className="field">
              <span className="field__label">参加してほしい人</span>
              <textarea
                className="field__control"
                name="targetSummary"
                required
                maxLength={1000}
                rows={3}
                placeholder="例：週に2回以上、SNS投稿に取り組める人"
              />
            </label>
            <label className="field">
              <span className="field__label">参加できる人数</span>
              <input
                className="field__control"
                name="participationLimit"
                type="number"
                min="1"
                max="10000"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">1週間の関連投稿（最大）</span>
              <input
                className="field__control"
                name="maxRelatedPerWeek"
                type="number"
                min="0"
                max="7"
                defaultValue="2"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">1週間の商品紹介投稿（最大）</span>
              <input
                className="field__control"
                name="maxAdsPerWeek"
                type="number"
                min="0"
                max="7"
                defaultValue="1"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">商品投稿を続けない日数</span>
              <input
                className="field__control"
                name="cooldownDays"
                type="number"
                min="0"
                max="30"
                defaultValue="2"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">1人が作れる企画の上限</span>
              <input
                className="field__control"
                name="generationLimitPerParticipant"
                type="number"
                min="1"
                max="365"
                defaultValue="60"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">重複とみなす近さ（70〜100％）</span>
              <input
                className="field__control"
                name="similarityThresholdBasisPoints"
                type="number"
                min="7000"
                max="10000"
                step="100"
                defaultValue="8500"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">開始日時</span>
              <input className="field__control" name="startsAt" type="datetime-local" required />
            </label>
            <label className="field">
              <span className="field__label">終了日時</span>
              <input className="field__control" name="endsAt" type="datetime-local" required />
            </label>
            <fieldset className="campaign-assets-fieldset">
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
            <button className="button button--primary" type="submit">
              募集の下書きを保存する
            </button>
          </form>
        )}
      </section>
      {message ? (
        <p className="notice notice--success" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {campaigns.map((campaign) => {
        const accepted = campaign.participations.filter(
          (item) => item.status === 'ACCEPTED',
        ).length;
        const durationDays = Math.ceil(
          (new Date(campaign.endsAt).valueOf() - new Date(campaign.startsAt).valueOf()) / 86400000,
        );
        const pilotReady =
          accepted >= 10 && accepted <= 22 && durationDays >= 30 && durationDays <= 60;
        return (
          <section className="settings-card campaign-card" key={campaign.id}>
            <div className="campaign-heading">
              <div>
                <p className="eyebrow">{campaign.group.name}</p>
                <h2>{campaign.name}</h2>
              </div>
              <span className={`campaign-status campaign-status--${campaign.status.toLowerCase()}`}>
                {campaign.status === 'DRAFT'
                  ? '下書き'
                  : campaign.status === 'OPEN'
                    ? '募集中'
                    : campaign.status === 'CLOSED'
                      ? '締切'
                      : '中止'}
              </span>
            </div>
            <p>
              {campaign.group.name} ／ {campaign.productPackVersion.productPack.name} 第
              {campaign.productPackVersion.version}版
            </p>
            <p className="campaign-card__theme">{campaign.theme}</p>
            <p>
              参加：{accepted} / {campaign.participationLimit}人 ／ 状態：{campaign.status}
            </p>
            <p>
              週の商品投稿は最大{campaign.maxRelatedPerWeek}件（商品紹介は最大
              {campaign.maxAdsPerWeek}件）、間を{campaign.cooldownDays}日あけます。
            </p>
            <p>
              1人最大{campaign.generationLimitPerParticipant}件 ／ 類似度
              {campaign.similarityThresholdBasisPoints / 100}%以上は保存しません。
            </p>
            <p>
              企画 {campaign.metrics.generated}件 ／ 採用 {campaign.metrics.accepted}件 ／ コピー{' '}
              {campaign.metrics.copied}件 ／ 投稿完了 {campaign.metrics.posted}件 ／ よかった{' '}
              {campaign.metrics.feedbackGood}件
            </p>
            <p>似すぎて停止した企画：{campaign.metrics.duplicateRejected}件</p>
            <p>
              採用率：
              {campaign.metrics.generated
                ? `${Math.round((campaign.metrics.accepted / campaign.metrics.generated) * 100)}%`
                : 'まだ計測できません'}{' '}
              ／ 投稿完了率：
              {campaign.metrics.generated
                ? `${Math.round((campaign.metrics.posted / campaign.metrics.generated) * 100)}%`
                : 'まだ計測できません'}
            </p>
            <p>
              先行テスト：{pilotReady ? '推奨人数・期間を満たしています' : '準備中'}（参加
              {accepted}人・{durationDays}日間）
            </p>
            {campaign.status === 'DRAFT' ? (
              <button
                className="button button--primary"
                type="button"
                onClick={() => void transition(campaign, 'OPEN')}
              >
                募集を開始する
              </button>
            ) : null}
            {campaign.status === 'OPEN' ? (
              <>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => void transition(campaign, 'CLOSED')}
                >
                  募集を締め切る
                </button>
                <button
                  className="button button--danger"
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
