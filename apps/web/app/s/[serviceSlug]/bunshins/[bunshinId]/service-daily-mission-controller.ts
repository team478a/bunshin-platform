'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClientRequestId } from '../../../../ui/client-request-id';
import {
  emptyBusinessOutcomes,
  type BusinessOutcomes,
} from '../../../../../src/services/business-outcomes';
import type { RewardsAction } from '../../../../ui/rewards-action-feedback';
import type { DailyMissionView } from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';

export const serviceExecutionResultOptions = [
  ['EXECUTION_COMPLETED', 'できた'],
  ['EXECUTION_PARTIAL', '一部できた'],
  ['EXECUTION_NOT_COMPLETED', 'できなかった'],
  ['EXECUTION_HELP_NEEDED', 'やり方が分からなかった'],
] as const;

export function useServiceDailyMissionController({
  endpoint,
  missions,
  variantPointCost,
  rewardsPilotActive,
  active,
  generation,
}: {
  endpoint: string;
  missions: DailyMissionView[];
  variantPointCost: number | null;
  rewardsPilotActive: boolean;
  active: boolean;
  generation?: { missionDate: string; timezone: string; socialProfileId: string };
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [otherDetail, setOtherDetail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pointNotice, setPointNotice] = useState<RewardsAction | null>(null);
  const [manualCopy, setManualCopy] = useState<{ title: string; value: string } | null>(null);
  const [variantInstructions, setVariantInstructions] = useState<Record<string, string>>({});
  const [variantConfirmation, setVariantConfirmation] = useState<{
    missionId: string;
    instruction?: string;
  } | null>(null);
  const [businessOutcomes, setBusinessOutcomes] = useState<Record<string, BusinessOutcomes>>(() =>
    Object.fromEntries(
      missions.map((mission) => [mission.id, mission.businessOutcomes ?? emptyBusinessOutcomes()]),
    ),
  );

  const key = () => createClientRequestId();

  async function generateToday() {
    if (!generation || pendingAction) return;
    const requestId = key();
    setPendingAction('generate');
    setMessage(null);
    try {
      const response = await fetch(`${endpoint}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': requestId },
        body: JSON.stringify({ ...generation, idempotencyKey: requestId }),
      });
      if (!response.ok) {
        setMessage(
          `今日の投稿案を準備できませんでした。もう一度お試しください。（受付番号: ${requestId}）`,
        );
        return;
      }
      setMessage('今日の投稿案を準備しました。');
      router.refresh();
    } catch {
      setMessage(`通信できませんでした。もう一度お試しください。（受付番号: ${requestId}）`);
    } finally {
      setPendingAction(null);
    }
  }

  async function record(id: string, resource: string, payload: Record<string, unknown>) {
    if (pendingAction) return false;
    setPendingAction(`${id}:${resource}`);
    setMessage(null);
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/${resource}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setMessage('操作を記録できませんでした。もう一度お試しください。');
        return false;
      }
      return true;
    } finally {
      setPendingAction(null);
    }
  }

  async function decide(id: string, decision: 'ACCEPTED' | 'REJECTED', rejectionReason?: string) {
    const ok = await record(id, 'decision', {
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

  async function recordExecutionResult(
    id: string,
    type: (typeof serviceExecutionResultOptions)[number][0],
  ) {
    if (await record(id, 'activities', { type, idempotencyKey: key() })) {
      setMessage('今日の結果を記録しました。次の提案を調整するために使います。');
      router.refresh();
    }
  }

  function copyWithSelection(value: string) {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.inset = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }

  async function writeToClipboard(value: string) {
    let clipboardAttempt: Promise<boolean> | null = null;
    try {
      clipboardAttempt = navigator.clipboard.writeText(value).then(
        () => true,
        () => false,
      );
    } catch {
      // LINE内ブラウザではClipboard API自体が提供されない場合がある。
    }
    const selectedCopy = copyWithSelection(value);
    return selectedCopy || (await clipboardAttempt) || false;
  }

  async function copy(
    mission: DailyMissionView,
    value: string,
    type: string,
    metadata?: { slideIndex: number },
  ) {
    if (pendingAction) return;
    const id = mission.id;
    setMessage(null);
    setManualCopy(null);
    const authorizationData = mission.copyAuthorization;
    if (!authorizationData) {
      setMessage('コピーの準備を確認できませんでした。画面を開き直してください。');
      return;
    }
    if (!authorizationData?.allowed) {
      setMessage(
        authorizationData?.reason === 'LINK_CHANGED'
          ? 'あなた専用の紹介URLが新しくなりました。この投稿案を作り直してください。'
          : authorizationData?.reason === 'APPROVAL_PENDING'
            ? 'この投稿案は運営者の確認待ちです。確認が終わるまでコピーできません。'
            : authorizationData?.reason === 'APPROVAL_CHANGES_REQUESTED'
              ? `この投稿案は見直しが必要です。${authorizationData.reviewNote ? `理由：${authorizationData.reviewNote}` : '運営者の案内を確認してください。'}`
              : 'この紹介URLは今は使えません。運営者へお問い合わせください。',
      );
      return;
    }
    setPendingAction(`${id}:copy`);
    if (!(await writeToClipboard(value))) {
      setManualCopy({
        title: type === 'COPIED_TEXT' ? '投稿文' : '画像用の文章',
        value,
      });
      setMessage('自動コピーができないため、下の文章を長押ししてコピーしてください。');
      setPendingAction(null);
      return;
    }
    setPendingAction(null);
    const ok = await record(id, 'activities', {
      type,
      idempotencyKey: key(),
      ...(metadata ? { metadata } : {}),
    });
    setMessage(
      ok
        ? type === 'COPIED_IMAGE_INSTRUCTION'
          ? 'コピーしました。次に、画像を作れるAIを開いて貼り付けてください。'
          : type === 'COPIED_TEXT'
            ? '投稿文をコピーしました。Instagramの投稿画面へ貼り付けてください。'
            : 'コピーしました。SNSへ貼り付けて使えます。'
        : null,
    );
  }

  async function markPosted(mission: DailyMissionView) {
    if (!mission.platform) return;
    const recorded = await record(mission.id, 'post-record', {
      platform: mission.platform,
      idempotencyKey: key(),
    });
    if (recorded) {
      if (rewardsPilotActive) setPointNotice('POSTED');
      router.refresh();
    }
  }

  async function openMission(mission: DailyMissionView) {
    const opening = expanded !== mission.id;
    setExpanded(opening ? mission.id : null);
    if (!opening || !active) return;
    const recorded = await record(mission.id, 'activities', {
      type: 'VIEWED',
      idempotencyKey: key(),
    });
    if (recorded && rewardsPilotActive) setPointNotice('VIEWED');
  }

  async function feedback(id: string, rating: 'GOOD' | 'NEUTRAL' | 'BAD') {
    if (await record(id, 'feedback', { rating, idempotencyKey: key() })) router.refresh();
  }

  async function saveBusinessOutcomes(id: string) {
    if (await record(id, 'business-outcome', businessOutcomes[id] ?? emptyBusinessOutcomes())) {
      setMessage('お客様の反応を保存しました。名前や詳しい内容の入力は必要ありません。');
      router.refresh();
    }
  }

  function requestVariant(missionId: string, instruction?: string) {
    if (pendingAction) return;
    if (variantPointCost === null) {
      setMessage('ポイント交換を利用できません。時間をおいて、もう一度お試しください。');
      return;
    }
    const preparedInstruction = instruction?.trim();
    setVariantConfirmation({
      missionId,
      ...(preparedInstruction ? { instruction: preparedInstruction } : {}),
    });
  }

  async function generateVariant(missionId: string, instruction?: string) {
    if (pendingAction || variantPointCost === null) return;
    setVariantConfirmation(null);
    const requestId = key();
    setPendingAction(`${missionId}:variant`);
    setMessage(null);
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
        setMessage(
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
      setMessage(`通信できませんでした。もう一度お試しください。（受付番号: ${requestId}）`);
    } finally {
      setPendingAction(null);
    }
  }

  async function selectVariant(missionId: string, variantId: string) {
    if (
      await record(missionId, `variants/${encodeURIComponent(variantId)}/select`, {
        idempotencyKey: key(),
      })
    )
      router.refresh();
  }
  return {
    expanded,
    pendingAction,
    rejecting,
    otherDetail,
    message,
    pointNotice,
    manualCopy,
    variantInstructions,
    variantConfirmation,
    businessOutcomes,
    setManualCopy,
    setMessage,
    setRejecting,
    setOtherDetail,
    setVariantInstructions,
    setVariantConfirmation,
    setBusinessOutcomes,
    generateToday,
    recordExecutionResult,
    copyWithSelection,
    copy,
    markPosted,
    openMission,
    feedback,
    saveBusinessOutcomes,
    requestVariant,
    generateVariant,
    selectVariant,
    decide,
  };
}

export type ServiceDailyMissionController = ReturnType<typeof useServiceDailyMissionController>;
