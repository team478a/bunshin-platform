'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';

type Mission = {
  id: string;
  bunshinId: string;
  bunshinName: string;
  topic: string;
  angle: string;
  format: 'IMAGE' | 'SLIDE';
  campaignId: string | null;
  productPackVersionId: string | null;
  request: { id: string; status: string } | null;
};

type RequestView = {
  id: string;
  status: string;
  errorCode: string | null;
  media: {
    id: string;
    status: 'READY' | 'ADOPTED';
    width: number;
    height: number;
    downloadPath: string;
  } | null;
};

const statusText: Record<string, string> = {
  DRAFT: '準備しています',
  QUEUED: '順番を待っています',
  GENERATING_ASSET: '画像を作っています',
  COMPOSING: '文字とレイアウトを整えています',
  READY_FOR_REVIEW: '画像ができました',
  FAILED: '画像を作れませんでした',
  CANCELLED: '作成を中止しました',
};

export function SocialImageWorkspace({
  workspaceId,
  groupId,
  groupMembershipId,
  missions,
}: {
  workspaceId: string;
  groupId: string;
  groupMembershipId: string;
  missions: Mission[];
}) {
  const [selectedId, setSelectedId] = useState(missions[0]?.id ?? '');
  const selected = useMemo(
    () => missions.find((mission) => mission.id === selectedId) ?? null,
    [missions, selectedId],
  );
  const [requestView, setRequestView] = useState<RequestView | null>(null);
  const [requestId, setRequestId] = useState(selected?.request?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const endpoint = selected
    ? `/api/workspaces/${workspaceId}/groups/${groupId}/bunshins/${selected.bunshinId}/daily-missions/${selected.id}/images`
    : null;

  useEffect(() => {
    setRequestId(selected?.request?.id ?? null);
    setRequestView(null);
    setMessage(null);
  }, [selected]);

  useEffect(() => {
    if (!endpoint || !requestId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = async () => {
      const response = await fetch(`${endpoint}/${requestId}`, { cache: 'no-store' });
      if (!response.ok || stopped) return;
      const payload = (await response.json()) as { data: RequestView };
      setRequestView(payload.data);
      if (!['READY_FOR_REVIEW', 'FAILED', 'CANCELLED'].includes(payload.data.status)) {
        timer = setTimeout(() => void refresh(), 2500);
      }
    };
    void refresh();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [endpoint, requestId]);

  async function create() {
    if (!selected || !endpoint || busy) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        groupMembershipId,
        campaignId: selected.campaignId,
        productPackVersionId: selected.productPackVersionId,
        idempotencyKey: crypto.randomUUID(),
        layout: {
          templateKey: 'PERSON_HEADLINE',
          headline: selected.topic,
          bodyLines: [selected.angle],
          cta: '詳しくは投稿文をご覧ください',
          accentColor: '#FF3B30',
        },
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      data?: { id?: string };
      error?: { code?: string };
    } | null;
    if (response.ok && payload?.data?.id) {
      setRequestId(payload.data.id);
      setRequestView(null);
      setMessage('画像づくりを始めました。このまま少しお待ちください。');
    } else {
      setMessage(
        payload?.error?.code === 'FORBIDDEN'
          ? 'この機能はまだ利用できません。グループ管理者へお問い合わせください。'
          : '画像づくりを始められませんでした。少し待ってから、もう一度お試しください。',
      );
    }
    setBusy(false);
  }

  async function decide(decision: 'ADOPTED' | 'REJECTED') {
    if (!endpoint || !requestId || !requestView?.media || busy) return;
    setBusy(true);
    const response = await fetch(`${endpoint}/${requestId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mediaId: requestView.media.id, decision }),
    });
    if (response.ok) {
      if (decision === 'ADOPTED') {
        setRequestView({
          ...requestView,
          media: { ...requestView.media, status: 'ADOPTED' },
        });
        setMessage('この画像を使うことにしました。下のボタンから保存できます。');
      } else {
        setRequestId(null);
        setRequestView(null);
        setMessage('今回は使わないことを記録しました。別の画像を作れます。');
      }
    } else {
      setMessage('操作を記録できませんでした。もう一度お試しください。');
    }
    setBusy(false);
  }

  if (missions.length === 0) {
    return (
      <section className="settings-card">
        <h2>画像にできる投稿案はまだありません</h2>
        <p>画像またはスライド形式の「今日やること」が作られると、ここに表示されます。</p>
      </section>
    );
  }

  const ready = requestView?.status === 'READY_FOR_REVIEW' && requestView.media;
  return (
    <div className="social-image-workspace">
      <section className="settings-card">
        <label htmlFor="image-mission">
          <strong>画像にする投稿案</strong>
        </label>
        <select
          id="image-mission"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {missions.map((mission) => (
            <option key={mission.id} value={mission.id}>
              {mission.topic}（{mission.bunshinName}）
            </option>
          ))}
        </select>
        {selected ? <p>{selected.angle}</p> : null}
      </section>

      <section className="settings-card social-image-review" aria-live="polite">
        <h2>{ready ? 'できあがった画像を確認' : '画像を作る'}</h2>
        {message ? <p className="notice">{message}</p> : null}
        {requestView && !ready && requestView.status !== 'READY_FOR_REVIEW' ? (
          <div className="social-image-progress">
            <span className="social-image-progress__mark" aria-hidden="true" />
            <p>{statusText[requestView.status] ?? '確認しています'}</p>
          </div>
        ) : null}
        {requestView?.status === 'FAILED' ? (
          <p>今回は画像を作れませんでした。もう一度「別の画像を作る」を押してください。</p>
        ) : null}
        {requestView?.status === 'READY_FOR_REVIEW' && !requestView.media ? (
          <p>前の画像は「今回は使わない」になっています。必要なら別の画像を作れます。</p>
        ) : null}
        {ready ? (
          <>
            <div className="social-image-preview">
              <Image
                src={requestView.media!.downloadPath}
                alt="作成したSNS投稿用画像"
                width={1080}
                height={1350}
                unoptimized
              />
            </div>
            {requestView.media!.status === 'ADOPTED' ? (
              <a className="button" href={requestView.media!.downloadPath}>
                画像を保存する
              </a>
            ) : (
              <div className="social-image-actions">
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => void decide('ADOPTED')}
                >
                  この画像を使う
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void decide('REJECTED')}
                >
                  今回は使わない
                </button>
              </div>
            )}
          </>
        ) : null}
        {!requestId ||
        requestView?.status === 'FAILED' ||
        (requestView?.status === 'READY_FOR_REVIEW' && !requestView.media) ? (
          <button className="button" type="button" disabled={busy} onClick={() => void create()}>
            {requestView?.status === 'FAILED' ? '別の画像を作る' : '画像を作る'}
          </button>
        ) : null}
        {ready ? (
          <button
            className="button button--secondary"
            type="button"
            disabled={busy}
            onClick={() => void create()}
          >
            別の画像を作る
          </button>
        ) : null}
        <p className="form-help">画像を作る操作は、この画面で本人が押したときだけ始まります。</p>
      </section>
    </div>
  );
}
