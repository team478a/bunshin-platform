'use client';

import { useEffect, useMemo, useState } from 'react';
import { resolveSocialImagePayment } from '../../src/social-image-payment';
import type {
  SocialImageMission,
  SocialImageRequestView,
  SocialImageSavedPhoto,
} from './social-image-workspace-model';
import { SocialImageWorkspaceView } from './social-image-workspace-view';

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
  savedPhotos,
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
  missions: SocialImageMission[];
  savedPhotos: SocialImageSavedPhoto[];
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
  const [requestView, setRequestView] = useState<SocialImageRequestView | null>(null);
  const [requestId, setRequestId] = useState(selected?.request?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceConsent, setReferenceConsent] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [videoMessage, setVideoMessage] = useState<string | null>(null);
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [revisionMode, setRevisionMode] = useState<'TEXT' | 'PHOTO' | 'BOTH'>('TEXT');
  const [revisionHeadline, setRevisionHeadline] = useState('');
  const [revisionBody, setRevisionBody] = useState('');
  const [photoInstruction, setPhotoInstruction] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [reviewNote, setReviewNote] = useState('');
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
  const availableSavedPhotos = useMemo(
    () => savedPhotos.filter((photo) => photo.bunshinId === selected?.bunshinId),
    [savedPhotos, selected?.bunshinId],
  );

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
    setSelectedPhotoId('');
    setEditingPage(null);
    setReviewReason('');
    setReviewNote('');
  }, [selected]);

  useEffect(() => {
    setReviewReason(requestView?.media?.reviewReason ?? '');
    setReviewNote(requestView?.media?.reviewNote ?? '');
  }, [requestView?.media?.reviewReason, requestView?.media?.reviewNote]);

  useEffect(() => {
    if (!endpoint || !requestId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = async () => {
      const response = await fetch(`${endpoint}/${requestId}`, { cache: 'no-store' });
      if (!response.ok || stopped) return;
      const payload = (await response.json()) as { data: SocialImageRequestView };
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
    const payload = (await response.json()) as { data: SocialImageRequestView };
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
          ...(selectedPhotoId ? { savedPhotoId: selectedPhotoId } : {}),
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
    if (decision === 'REJECTED' && !reviewReason) {
      setMessage('今回は使わない理由を選んでください。');
      return;
    }
    setBusy(true);
    const response = await fetch(`${endpoint}/${requestId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mediaId: requestView.media.id,
        decision,
        reviewReason: decision === 'REJECTED' ? reviewReason : null,
        reviewNote: decision === 'REJECTED' && reviewNote.trim() ? reviewNote.trim() : null,
      }),
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
        setRequestView({
          ...requestView,
          media: { ...requestView.media, status: 'REJECTED', reviewReason, reviewNote },
          mediaPages: requestView.mediaPages.map((media) => ({
            ...media,
            status: 'REJECTED',
            reviewReason,
            reviewNote,
          })),
        });
        setMessage('理由を運営者へ送りました。必要なら別の画像を作れます。');
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

  return (
    <SocialImageWorkspaceView
      workspaceId={workspaceId}
      groupId={groupId}
      missions={missions}
      selected={selected}
      selectedId={selectedId}
      availableSavedPhotos={availableSavedPhotos}
      busy={busy}
      referenceFile={referenceFile}
      referenceConsent={referenceConsent}
      selectedPhotoId={selectedPhotoId}
      payment={payment}
      message={message}
      videoMessage={videoMessage}
      requestView={requestView}
      requestId={requestId}
      editingPage={editingPage}
      revisionMode={revisionMode}
      revisionHeadline={revisionHeadline}
      revisionBody={revisionBody}
      photoInstruction={photoInstruction}
      reviewReason={reviewReason}
      reviewNote={reviewNote}
      setSelectedId={setSelectedId}
      setReferenceFile={setReferenceFile}
      setReferenceConsent={setReferenceConsent}
      setSelectedPhotoId={setSelectedPhotoId}
      setEditingPage={setEditingPage}
      setRevisionMode={setRevisionMode}
      setRevisionHeadline={setRevisionHeadline}
      setRevisionBody={setRevisionBody}
      setPhotoInstruction={setPhotoInstruction}
      setReviewReason={setReviewReason}
      setReviewNote={setReviewNote}
      openRevision={openRevision}
      revisePage={revisePage}
      create={create}
      decide={decide}
      createVideo={createVideo}
    />
  );
}
