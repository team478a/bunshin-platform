'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClientRequestId } from '../../../ui/client-request-id';
import type { RewardsAction } from '../../../ui/rewards-action-feedback';
import { missionGenerationResult } from '../../../ui/mission-generation-result';
import type { ContentAssistanceLevel, DailyMissionView } from './daily-mission-content';

export type PersonalSocialProfileView = {
  id: string;
  platform: 'INSTAGRAM' | 'TIKTOK' | 'X' | 'THREADS' | 'YOUTUBE_SHORTS' | 'OTHER';
  status: 'ACTIVE' | 'INACTIVE';
};

export function usePersonalDailyMissionController({
  workspaceId,
  bunshinId,
  capabilityStatus,
  profiles,
  variantPointCost,
  rewardsPilotActive,
}: {
  workspaceId: string;
  bunshinId: string;
  capabilityStatus: 'ACTIVE' | 'SUSPENDED' | 'LOCKED' | null;
  profiles: PersonalSocialProfileView[];
  variantPointCost: number | null;
  rewardsPilotActive: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assistanceSelections, setAssistanceSelections] = useState<
    Record<string, ContentAssistanceLevel>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [pointNotice, setPointNotice] = useState<RewardsAction | null>(null);
  const [resubmitMissionId, setResubmitMissionId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [otherDetail, setOtherDetail] = useState('');
  const [generating, setGenerating] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [variantInstructions, setVariantInstructions] = useState<Record<string, string>>({});
  const [variantConfirmation, setVariantConfirmation] = useState<{
    missionId: string;
    instruction?: string;
  } | null>(null);
  const [missionDate, setMissionDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const activeProfiles = profiles.filter(({ status }) => status === 'ACTIVE');
  const [socialProfileId, setSocialProfileId] = useState(activeProfiles[0]?.id ?? '');
  const active = capabilityStatus === 'ACTIVE';
  const busy = generating || pendingAction !== null;
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/${encodeURIComponent(bunshinId)}/daily-missions`;

  async function generate() {
    setError(null);
    setGenerating(true);
    const requestId = createClientRequestId();
    try {
      const response = await fetch(`${endpoint}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': requestId },
        body: JSON.stringify({
          missionDate,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          socialProfileId,
          idempotencyKey: requestId,
        }),
      });
      const result = await missionGenerationResult(response, requestId);
      if (!response.ok) setError(result.message);
      if (result.refresh) router.refresh();
    } catch {
      setError(
        `通信できませんでした。接続を確認して、もう一度お試しください。（受付番号: ${requestId}）`,
      );
    } finally {
      setGenerating(false);
    }
  }

  async function transition(id: string, action: string) {
    if (pendingAction !== null) return false;
    setError(null);
    setPendingAction(`${id}:${action}`);
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) {
        setError('今日やることを更新できませんでした。もう一度お試しください。');
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setPendingAction(null);
    }
  }

  async function view(mission: DailyMissionView) {
    if (expanded === mission.id) {
      setExpanded(null);
      return;
    }
    if (mission.status === 'GENERATED' && active) {
      if (!(await transition(mission.id, 'viewed'))) return;
    }
    setExpanded(mission.id);
    if (active) {
      const recorded = await activity(mission.id, 'VIEWED');
      if (recorded && rewardsPilotActive) setPointNotice('VIEWED');
    }
  }

  function key() {
    return crypto.randomUUID();
  }
  async function engagementPost(id: string, resource: string, body: Record<string, unknown>) {
    if (pendingAction !== null) return false;
    setPendingAction(`${id}:${resource}`);
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/${resource}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError('操作を記録できませんでした。再度お試しください。');
        return false;
      }
      return true;
    } finally {
      setPendingAction(null);
    }
  }
  async function activity(id: string, type: string, metadata?: { slideIndex: number }) {
    setError(null);
    return engagementPost(id, 'activities', {
      type,
      idempotencyKey: key(),
      ...(metadata ? { metadata } : {}),
    });
  }
  async function continuity(id: string, type: 'CONFIRMED' | 'RESTED') {
    const ok = await activity(id, type);
    if (ok) router.refresh();
  }
  async function decide(id: string, decision: 'ACCEPTED' | 'REJECTED', rejectionReason?: string) {
    setError(null);
    const ok = await engagementPost(id, 'decision', {
      decision,
      idempotencyKey: key(),
      ...(rejectionReason ? { rejectionReason } : {}),
      ...(rejectionReason === 'OTHER' && otherDetail.trim()
        ? { rejectionDetail: otherDetail.trim() }
        : {}),
    });
    if (ok) {
      setRejecting(null);
      setOtherDetail('');
      router.refresh();
    }
  }
  async function copy(id: string, value: string, type: string, metadata?: { slideIndex: number }) {
    if (pendingAction !== null) return;
    setError(null);
    setPendingAction(`${id}:copy`);
    const authorization = await fetch(`${endpoint}/${encodeURIComponent(id)}/copy-authorization`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!authorization.ok) {
      setError('専用URLを確認できませんでした。少し待ってから、もう一度お試しください。');
      setPendingAction(null);
      return;
    }
    const result = (await authorization.json()) as {
      data?: { allowed?: boolean; reason?: string; reviewNote?: string | null };
    };
    if (!result.data?.allowed) {
      setResubmitMissionId(result.data?.reason === 'APPROVAL_CHANGES_REQUESTED' ? id : null);
      setError(
        result.data?.reason === 'LINK_CHANGED'
          ? 'あなた専用の紹介URLが新しくなりました。この投稿案を作り直してください。'
          : result.data?.reason === 'APPROVAL_PENDING'
            ? 'この投稿案は、運営者の確認待ちです。確認が終わるまでコピーできません。'
            : result.data?.reason === 'APPROVAL_CHANGES_REQUESTED'
              ? `この投稿案は見直しが必要です。${result.data.reviewNote ? `理由：${result.data.reviewNote}` : '管理者の案内を確認してください。'}`
              : 'この紹介URLは今は使えません。管理者へお問い合わせください。',
      );
      setPendingAction(null);
      return;
    }
    setResubmitMissionId(null);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError('クリップボードへコピーできませんでした。ブラウザの権限を確認してください。');
      setPendingAction(null);
      return;
    }
    setPendingAction(null);
    await activity(id, type, metadata);
  }
  async function resubmitForApproval(id: string) {
    if (pendingAction !== null) return;
    setError(null);
    setPendingAction(`${id}:resubmit`);
    try {
      const response = await fetch(
        `${endpoint}/${encodeURIComponent(id)}/posting-approval/resubmit`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        },
      );
      if (!response.ok) {
        setError('確認をもう一度お願いできませんでした。画面を更新してお試しください。');
        return;
      }
      setResubmitMissionId(null);
      setError('運営者へ、もう一度確認をお願いしました。');
      router.refresh();
    } finally {
      setPendingAction(null);
    }
  }
  async function markPosted(mission: DailyMissionView) {
    if (!mission.platform) {
      setError('どのSNSに投稿するか決まっていません。');
      return;
    }
    setError(null);
    const ok = await engagementPost(mission.id, 'post-record', {
      platform: mission.platform,
      idempotencyKey: key(),
    });
    if (ok) {
      if (rewardsPilotActive) setPointNotice('POSTED');
      router.refresh();
    }
  }
  async function feedback(id: string, rating: 'GOOD' | 'NEUTRAL' | 'BAD') {
    setError(null);
    const ok = await engagementPost(id, 'feedback', { rating, idempotencyKey: key() });
    if (ok) router.refresh();
  }

  function requestVariant(missionId: string, instruction?: string) {
    if (pendingAction !== null) return;
    if (variantPointCost === null) {
      setError('ポイント交換を利用できません。時間をおいて、もう一度お試しください。');
      return;
    }
    const preparedInstruction = instruction?.trim();
    setVariantConfirmation({
      missionId,
      ...(preparedInstruction ? { instruction: preparedInstruction } : {}),
    });
  }

  async function generateVariant(missionId: string, instruction?: string) {
    if (pendingAction !== null || variantPointCost === null) return;
    setVariantConfirmation(null);
    setError(null);
    const requestId = createClientRequestId();
    setPendingAction(`${missionId}:variant`);
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(missionId)}/variants`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': requestId },
        body: JSON.stringify({
          idempotencyKey: requestId,
          acceptedPointCost: variantPointCost,
          ...(instruction?.trim() ? { instruction: instruction.trim() } : {}),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { code?: string };
        } | null;
        setError(
          payload?.error?.code === 'CONTENT_REJECTED'
            ? `安全に使える別案を作れませんでした。時間をおいてもう一度お試しください。（受付番号: ${requestId}）`
            : payload?.error?.code === 'FORBIDDEN'
              ? 'WPが足りないか、ポイント交換を利用できません。ポイント画面を確認してください。'
              : payload?.error?.code === 'CONFLICT'
                ? '価格が変わったか、別案がすでにあります。画面を更新してください。'
                : `別案を作れませんでした。もう一度お試しください。（受付番号: ${requestId}）`,
        );
        return;
      }
      setVariantInstructions((current) => ({ ...current, [missionId]: '' }));
      router.refresh();
    } catch {
      setError(`通信できませんでした。もう一度お試しください。（受付番号: ${requestId}）`);
    } finally {
      setPendingAction(null);
    }
  }

  async function selectVariant(missionId: string, variantId: string) {
    const ok = await engagementPost(missionId, `variants/${encodeURIComponent(variantId)}/select`, {
      idempotencyKey: key(),
    });
    if (ok) router.refresh();
  }

  return {
    expanded,
    assistanceSelections,
    error,
    pointNotice,
    resubmitMissionId,
    rejecting,
    otherDetail,
    generating,
    pendingAction,
    variantInstructions,
    variantConfirmation,
    variantPointCost,
    missionDate,
    activeProfiles,
    socialProfileId,
    active,
    busy,
    setAssistanceSelections,
    setRejecting,
    setOtherDetail,
    setVariantInstructions,
    setVariantConfirmation,
    setMissionDate,
    setSocialProfileId,
    generate,
    transition,
    view,
    continuity,
    decide,
    copy,
    resubmitForApproval,
    markPosted,
    feedback,
    requestVariant,
    generateVariant,
    selectVariant,
  };
}

export type PersonalDailyMissionController = ReturnType<typeof usePersonalDailyMissionController>;
