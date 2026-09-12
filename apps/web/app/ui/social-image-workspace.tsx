'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import type { SocialImageLayout } from '@bunshin/application';
import { resolveSocialImagePayment } from '../../src/social-image-payment';

type Mission = {
  id: string;
  bunshinId: string;
  bunshinName: string;
  topic: string;
  angle: string;
  format: 'IMAGE' | 'SLIDE';
  layout: SocialImageLayout;
  campaignId: string | null;
  productPackVersionId: string | null;
  request: { id: string; status: string } | null;
};

type RequestView = {
  id: string;
  status: string;
  layout: SocialImageLayout;
  revision: number;
  errorCode: string | null;
  media: {
    id: string;
    status: 'READY' | 'ADOPTED';
    width: number;
    height: number;
    downloadPath: string;
    savePath: string;
  } | null;
  mediaPages: Array<{
    id: string;
    pageIndex: number;
    status: 'READY' | 'ADOPTED';
    width: number;
    height: number;
    downloadPath: string;
    savePath: string;
  }>;
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
  servicePlanImageRemaining,
  pilotImageRemaining,
  imageCreditAvailable,
  pointCost,
  initialAvailablePoints,
  missions,
  initialMissionId,
}: {
  workspaceId: string;
  groupId: string;
  groupMembershipId: string;
  servicePlanImageRemaining: number | null;
  pilotImageRemaining: number | null;
  imageCreditAvailable: number | null;
  pointCost: number | null;
  initialAvailablePoints: number;
  missions: Mission[];
  initialMissionId?: string | undefined;
}) {
  const [selectedId, setSelectedId] = useState(
    missions.some((mission) => mission.id === initialMissionId)
      ? (initialMissionId ?? '')
      : (missions[0]?.id ?? ''),
  );
  const selected = useMemo(
    () => missions.find((mission) => mission.id === selectedId) ?? null,
    [missions, selectedId],
  );
  const [requestView, setRequestView] = useState<RequestView | null>(null);
  const [requestId, setRequestId] = useState(selected?.request?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceConsent, setReferenceConsent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [videoMessage, setVideoMessage] = useState<string | null>(null);
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [revisionMode, setRevisionMode] = useState<'TEXT' | 'PHOTO' | 'BOTH'>('TEXT');
  const [revisionHeadline, setRevisionHeadline] = useState('');
  const [revisionBody, setRevisionBody] = useState('');
  const [photoInstruction, setPhotoInstruction] = useState('');
  const [availablePoints, setAvailablePoints] = useState(initialAvailablePoints);
  const [servicePlanRemaining, setServicePlanRemaining] = useState(servicePlanImageRemaining);
  const [pilotRemaining, setPilotRemaining] = useState(pilotImageRemaining);
  const [availableCredits, setAvailableCredits] = useState(imageCreditAvailable);
  const payment = resolveSocialImagePayment({
    servicePlanRemaining,
    pilotRemaining,
    imageCreditAvailable: availableCredits,
    pointCost,
    availablePoints,
  });

  const endpoint = selected
    ? `/api/workspaces/${workspaceId}/groups/${groupId}/bunshins/${selected.bunshinId}/daily-missions/${selected.id}/images`
    : null;

  useEffect(() => {
    setRequestId(selected?.request?.id ?? null);
    setRequestView(null);
    setMessage(null);
    setVideoMessage(null);
    setReferenceFile(null);
    setReferenceConsent(false);
    setEditingPage(null);
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

  async function refreshRequest() {
    if (!endpoint || !requestId) return null;
    const response = await fetch(`${endpoint}/${requestId}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = (await response.json()) as { data: RequestView };
    setRequestView(payload.data);
    return payload.data;
  }

  function openRevision(pageIndex: number) {
    if (!requestView) return;
    const { carouselPages, ...cover } = requestView.layout;
    const page = [cover, ...(carouselPages ?? [])][pageIndex];
    if (!page) return;
    setEditingPage(pageIndex);
    setRevisionMode('TEXT');
    setRevisionHeadline(page.headline);
    setRevisionBody(page.bodyLines.join(''));
    setPhotoInstruction('');
    setMessage(`${pageIndex + 1}枚目の直したい内容を選んでください。`);
  }

  async function revisePage() {
    if (editingPage === null || !endpoint || !requestId || !requestView || busy) return;
    const media = requestView.mediaPages.find((item) => item.pageIndex === editingPage);
    if (!media) return;
    setBusy(true);
    setMessage(revisionMode === 'TEXT' ? '文章を直しています…' : '写真を作り直しています…');
    try {
      const response = await fetch(`${endpoint}/${requestId}/pages/${editingPage}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: revisionMode,
          expectedRevision: requestView.revision,
          currentMediaId: media.id,
          ...(revisionMode !== 'PHOTO' ? { headline: revisionHeadline, body: revisionBody } : {}),
          ...(revisionMode !== 'TEXT' ? { photoInstruction } : {}),
        }),
      });
      if (!response.ok) {
        setMessage(
          response.status === 403
            ? 'この投稿で修正できる3回を使い切りました。必要なら「別の画像を作る」を押してください。'
            : response.status === 409
              ? '画像が更新されました。画面を読み直して、もう一度お試しください。'
              : '修正できませんでした。入力内容を確認して、もう一度お試しください。',
        );
        await refreshRequest();
        return;
      }
      await refreshRequest();
      setEditingPage(null);
      setMessage(`${editingPage + 1}枚目を直しました。他の4枚は変えていません。`);
    } catch {
      setMessage('通信できませんでした。もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!selected || !endpoint || busy) return;
    if (
      referenceFile &&
      (!referenceConsent || referenceFile.size === 0 || referenceFile.size > 3_000_000)
    ) {
      setMessage('3MB以下の写真を選び、利用許可を確認してください。');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const referenceBase64 = referenceFile
        ? await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const encoded =
                typeof reader.result === 'string' ? reader.result.split(',')[1] : null;
              if (!encoded) reject(new Error('empty image'));
              else resolve(encoded);
            };
            reader.onerror = () => reject(new Error('read failed'));
            reader.readAsDataURL(referenceFile);
          })
        : null;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupMembershipId,
          ...(referenceBase64
            ? { referenceImage: { base64: referenceBase64, rightsConfirmed: true } }
            : {}),
          campaignId: selected.campaignId,
          productPackVersionId: selected.productPackVersionId,
          idempotencyKey: crypto.randomUUID(),
          layout: selected.layout,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: { id?: string };
        error?: { code?: string };
      } | null;
      if (response.ok && payload?.data?.id) {
        if (payment.mode === 'SERVICE_PLAN')
          setServicePlanRemaining((value) => Math.max(0, (value ?? 0) - 1));
        else if (payment.mode === 'PILOT')
          setPilotRemaining((value) => Math.max(0, (value ?? 0) - 1));
        else if (payment.mode === 'SERVICE_CREDIT')
          setAvailableCredits((value) => Math.max(0, (value ?? 0) - 1));
        else if (pointCost !== null) setAvailablePoints((value) => Math.max(0, value - pointCost));
        setRequestId(payload.data.id);
        setRequestView(null);
        setMessage('画像づくりを始めました。このまま少しお待ちください。');
      } else {
        setMessage(
          payload?.error?.code === 'FORBIDDEN'
            ? payment.mode === 'SERVICE_PLAN' || payment.mode === 'PILOT'
              ? '試験運用の画像作成枠が残っていないか、この機能を利用できません。運営へご確認ください。'
              : payment.mode === 'SERVICE_CREDIT'
                ? '画像作成回数が足りないか、この機能を利用できません。画像作成回数の画面をご確認ください。'
                : 'ポイントが足りないか、この機能を利用できません。ポイント画面をご確認ください。'
            : payload?.error?.code === 'VALIDATION_ERROR'
              ? '写真の形式・サイズや入力内容を確認してください。写真は3MB以下のJPEG・PNG・WebPに対応しています。'
              : '画像づくりを始められませんでした。少し待ってから、もう一度お試しください。',
        );
      }
    } catch {
      setMessage('写真の読み込み、または送信に失敗しました。もう一度お試しください。');
    } finally {
      setBusy(false);
    }
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
          mediaPages: requestView.mediaPages.map((media) => ({
            ...media,
            status: 'ADOPTED',
          })),
        });
        setMessage('この投稿画像を使うことにしました。各ページを下から保存できます。');
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

  async function createVideo() {
    if (!endpoint || !requestId || busy) return;
    setBusy(true);
    setVideoMessage('5枚の画像から25秒の動画を作り始めています。');
    try {
      const response = await fetch(`${endpoint}/${requestId}/video`, { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as {
        data?: { projectId?: string };
        error?: { code?: string };
      } | null;
      if (!response.ok || !payload?.data?.projectId) {
        setVideoMessage(
          payload?.error?.code === 'FORBIDDEN'
            ? '動画作成を利用できません。運営へご確認ください。'
            : '動画を作り始められませんでした。少し待ってから、もう一度お試しください。',
        );
        return;
      }
      window.location.assign(`/groups/${groupId}/videos/${payload.data.projectId}`);
    } catch {
      setVideoMessage('通信できませんでした。もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  if (missions.length === 0) {
    return (
      <section className="settings-card">
        <h2>画像にできる投稿案はまだありません</h2>
        <p>画像またはスライド形式の「今日やること」が作られると、ここに表示されます。</p>
      </section>
    );
  }

  const ready =
    requestView?.status === 'READY_FOR_REVIEW' &&
    requestView.media &&
    requestView.mediaPages.length > 0;
  const canCreate = payment.canCreate;
  return (
    <div className="social-image-workspace">
      <section className="settings-card">
        <p className="eyebrow">作る内容</p>
        <h2>{selected?.topic ?? '今日の投稿画像'}</h2>
        <p>文章や配置は自動で整えます。</p>
        {missions.length > 1 ? (
          <details className="social-image-options">
            <summary>別の投稿案を選ぶ</summary>
            <label htmlFor="image-mission">画像にする投稿案</label>
            <select
              id="image-mission"
              disabled={busy}
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {missions.map((mission) => (
                <option key={mission.id} value={mission.id}>
                  {mission.topic}（{mission.bunshinName}）
                </option>
              ))}
            </select>
          </details>
        ) : null}
        <details className="social-image-options">
          <summary>商品や本人の写真を使いたい方</summary>
          {selected ? <p>{selected.angle}</p> : null}
          <label htmlFor="image-reference">参考にする写真（なくても作れます）</label>
          <input
            key={selectedId}
            id="image-reference"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              setReferenceFile(event.target.files?.[0] ?? null);
              setReferenceConsent(false);
            }}
          />
          <p>
            JPEG・PNG・WebP、3MB以下。この画像作成にだけ使い、参考写真は7日後から順次削除します。
          </p>
          {referenceFile ? (
            <label>
              <input
                type="checkbox"
                checked={referenceConsent}
                disabled={busy}
                onChange={(event) => setReferenceConsent(event.target.checked)}
              />
              この写真を使う権利と、写っている本人の同意があり、画像生成のためOpenAIへ送信することを確認しました。
            </label>
          ) : null}
        </details>
      </section>

      <section className="settings-card social-image-review" aria-live="polite">
        <h2>{ready ? 'できあがった画像を確認' : '青いボタンを押してください'}</h2>
        {payment.mode === 'SERVICE_PLAN' || payment.mode === 'PILOT' ? (
          <p>試験運用の画像作成枠を1回使います。残り{payment.remaining}回です。</p>
        ) : payment.mode === 'SERVICE_CREDIT' ? (
          <p>画像作成回数を1回使います。残り{payment.remaining}回です。</p>
        ) : (
          <p>
            この画像の作成：
            {payment.pointCost === null ? '現在利用できません' : `${payment.pointCost}ポイント`} ／
            残り：{payment.availablePoints}ポイント
          </p>
        )}
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
              {requestView.mediaPages.map((media) => (
                <figure key={media.id}>
                  <Image
                    src={media.downloadPath}
                    alt={`作成したSNS投稿用画像 ${media.pageIndex + 1}ページ目`}
                    width={1080}
                    height={1350}
                    unoptimized
                  />
                  <figcaption>{media.pageIndex + 1}枚目</figcaption>
                  {requestView.media!.status !== 'ADOPTED' ? (
                    <button
                      className="button button--secondary social-image-revise-button"
                      type="button"
                      disabled={busy}
                      onClick={() => openRevision(media.pageIndex)}
                    >
                      この1枚を直す
                    </button>
                  ) : null}
                </figure>
              ))}
            </div>
            {requestView.media!.status !== 'ADOPTED' && editingPage !== null ? (
              <section className="social-image-revision" aria-labelledby="revision-title">
                <h3 id="revision-title">{editingPage + 1}枚目を直す</h3>
                <p>直したいものを1つ選んでください。</p>
                <p className="form-help">
                  この投稿はあと{Math.max(0, 8 - requestView.revision)}回修正できます。
                </p>
                <div className="social-image-revision__choices">
                  {(
                    [
                      ['TEXT', '文章だけ'],
                      ['PHOTO', '写真だけ'],
                      ['BOTH', '文章と写真'],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="revision-mode"
                        value={value}
                        checked={revisionMode === value}
                        disabled={busy}
                        onChange={() => setRevisionMode(value)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {revisionMode !== 'PHOTO' ? (
                  <>
                    <label htmlFor="revision-headline">大きく見せる言葉</label>
                    <input
                      id="revision-headline"
                      type="text"
                      value={revisionHeadline}
                      maxLength={20}
                      disabled={busy}
                      onChange={(event) => setRevisionHeadline(event.target.value)}
                    />
                    <label htmlFor="revision-body">その下の説明</label>
                    <textarea
                      id="revision-body"
                      value={revisionBody}
                      maxLength={editingPage === 0 ? 24 : 72}
                      rows={4}
                      disabled={busy}
                      onChange={(event) => setRevisionBody(event.target.value)}
                    />
                  </>
                ) : null}
                {revisionMode !== 'TEXT' ? (
                  <>
                    <label htmlFor="revision-photo">写真をどう変えたいですか？</label>
                    <textarea
                      id="revision-photo"
                      value={photoInstruction}
                      maxLength={200}
                      rows={4}
                      disabled={busy}
                      placeholder="例：女性が窓辺で深呼吸している写真にする"
                      onChange={(event) => setPhotoInstruction(event.target.value)}
                    />
                    <p className="form-help">
                      同じ人物と色合いを参考にして、この1枚だけ作り直します。
                    </p>
                  </>
                ) : null}
                <div className="social-image-actions">
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={
                      busy ||
                      (revisionMode !== 'PHOTO' &&
                        (!revisionHeadline.trim() || revisionBody.trim().length < 3)) ||
                      (revisionMode !== 'TEXT' && photoInstruction.trim().length < 3)
                    }
                    onClick={() => void revisePage()}
                  >
                    {busy ? '直しています…' : `${editingPage + 1}枚目を直す`}
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => setEditingPage(null)}
                  >
                    やめる
                  </button>
                </div>
              </section>
            ) : null}
            {requestView.media!.status === 'ADOPTED' ? (
              <>
                <div className="social-image-save-guide">
                  <p>
                    <strong>iPhoneで保存する方法</strong>
                  </p>
                  <ol>
                    <li>下のボタンを押して画像を開く</li>
                    <li>開いた画像を長押しする</li>
                    <li>「写真に保存」を押す</li>
                  </ol>
                </div>
                <div className="social-image-actions">
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={busy || requestView.mediaPages.length !== 5}
                    onClick={() => void createVideo()}
                  >
                    {busy ? '動画を作り始めています…' : 'この5枚を25秒の動画にする'}
                  </button>
                  {videoMessage ? (
                    <p className="notice" role="status" aria-live="polite">
                      {videoMessage}
                    </p>
                  ) : null}
                  {requestView.mediaPages.map((media) => (
                    <a
                      className="button"
                      href={media.downloadPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      key={media.id}
                    >
                      {media.pageIndex + 1}枚目を開いて保存
                    </a>
                  ))}
                </div>
                <p className="form-help">
                  音声は入れません。文字が読みやすい速さで画像を切り替え、完成したらLINEでお知らせします。
                </p>
              </>
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
          <button
            className="button"
            type="button"
            disabled={busy || !canCreate}
            onClick={() => void create()}
          >
            {requestView?.status === 'FAILED' ? '別の画像を作る' : '画像を作る'}
          </button>
        ) : null}
        {ready ? (
          <button
            className="button button--secondary"
            type="button"
            disabled={busy || !canCreate}
            onClick={() => void create()}
          >
            別の画像を作る
          </button>
        ) : null}
        <p className="form-help">画像を作る操作は、この画面で本人が押したときだけ始まります。</p>
        {(payment.mode === 'SERVICE_PLAN' || payment.mode === 'PILOT') && !payment.canCreate ? (
          <p className="form-help">試験運用の画像作成枠を使い切りました。運営へご確認ください。</p>
        ) : null}
        {payment.mode === 'SERVICE_CREDIT' && !payment.canCreate ? (
          <p className="form-help">
            画像作成回数が足りません。紹介特典や運営からの付与をお待ちください。
          </p>
        ) : null}
        {payment.mode === 'POINTS' &&
        payment.pointCost !== null &&
        payment.availablePoints < payment.pointCost ? (
          <p className="form-help">ポイントが足りません。投稿案の確認や投稿完了でためられます。</p>
        ) : null}
      </section>
    </div>
  );
}
