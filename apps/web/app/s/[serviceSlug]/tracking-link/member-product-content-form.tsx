'use client';

import {
  MEMBER_PRODUCT_CONTENT_PLATFORMS,
  type MemberProductContentPlatform,
  type MemberProductMasterOption,
  type MemberProductProfileRecord,
  type MemberTrackingLinkSettings,
} from '@bunshin/application';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const platformLabel = { INSTAGRAM: 'Instagram', X: 'X', THREADS: 'Threads' } as const;

export function MemberProductContentForm({
  serviceSlug,
  settings,
  profiles,
  productMasters,
  bunshins,
}: {
  serviceSlug: string;
  settings: MemberTrackingLinkSettings;
  profiles: MemberProductProfileRecord[];
  productMasters: MemberProductMasterOption[];
  bunshins: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const activeLinks = settings.links.filter((link) => link.status === 'ACTIVE');
  const [profileId, setProfileId] = useState('');
  const [linkId, setLinkId] = useState(activeLinks[0]?.id ?? '');
  const [productPackId, setProductPackId] = useState('');
  const [name, setName] = useState('');
  const [appealPoint, setAppealPoint] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [platform, setPlatform] = useState<MemberProductContentPlatform>('INSTAGRAM');
  const [bunshinId, setBunshinId] = useState(bunshins[0]?.id ?? '');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [activityId, setActivityId] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState(0);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  function selectProfile(id: string) {
    setProfileId(id);
    setCandidates([]);
    setActivityId('');
    const profile = profiles.find((item) => item.id === id);
    if (!profile) {
      setLinkId(activeLinks[0]?.id ?? '');
      setProductPackId('');
      setName('');
      setAppealPoint('');
      setTargetAudience('');
      return;
    }
    setLinkId(profile.externalTrackingLinkId);
    setProductPackId(profile.productPackId ?? '');
    setName(profile.name);
    setAppealPoint(profile.appealPoint);
    setTargetAudience(profile.targetAudience ?? '');
  }

  async function saveAndGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const link = activeLinks.find((item) => item.id === linkId);
    if (!link) {
      setMessage('使用中のURLを選択してください。');
      return;
    }
    setSaving(true);
    setActivityId('');
    setMessage('商品情報を保存しています…');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/member-products`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            profileId: profileId || null,
            externalTrackingLinkId: linkId,
            productPackId: productPackId || null,
            name,
            appealPoint,
            targetAudience: targetAudience || null,
          }),
        },
      );
      if (!response.ok) throw new Error('SAVE_FAILED');
      const payload = (await response.json()) as { data: { id: string } };
      if (!bunshinId) throw new Error('BUNSHIN_REQUIRED');
      setMessage('分身設定に合わせて3案を作成しています…');
      const suggestionResponse = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/member-products/suggestions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ profileId: payload.data.id, bunshinId, platform }),
        },
      );
      if (!suggestionResponse.ok) throw new Error('GENERATION_FAILED');
      const suggestionPayload = (await suggestionResponse.json()) as {
        data: { candidates: Array<{ body: string }>; activityId: string };
      };
      setCandidates(suggestionPayload.data.candidates.map(({ body }) => body));
      setActivityId(suggestionPayload.data.activityId);
      setSelectedCandidate(0);
      setMessage('分身設定に合わせた投稿文を3案作成しました。内容を確認してください。');
      setProfileId(payload.data.id);
      router.refresh();
    } catch {
      setCandidates([]);
      setActivityId('');
      setMessage('保存またはAI投稿案の作成ができませんでした。少し待ってから再度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    const body = candidates[selectedCandidate];
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      const recorded = await recordActivity('COPIED');
      setMessage(
        recorded
          ? '投稿文をコピーしました。'
          : '投稿文をコピーしました。活動記録だけ保存できませんでした。',
      );
    } catch {
      setMessage('コピーできませんでした。投稿文を長押ししてコピーしてください。');
    }
  }

  async function markPosted() {
    if (!activityId) return;
    setSaving(true);
    const recorded = await recordActivity('POSTED');
    setMessage(
      recorded
        ? '投稿完了を記録しました。'
        : '投稿完了を記録できませんでした。少し待ってから再度お試しください。',
    );
    setSaving(false);
  }

  async function recordActivity(type: 'COPIED' | 'POSTED') {
    if (!activityId) return false;
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/member-products/activity`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            activityId,
            type,
            candidateIndex: selectedCandidate,
          }),
        },
      );
      if (!response.ok) return false;
      router.refresh();
      return true;
    } catch {
      return false;
    }
  }

  async function archiveSelectedProfile() {
    if (!profileId || saving) return;
    setSaving(true);
    setMessage('保存した商品を非表示にしています…');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/member-products/${encodeURIComponent(profileId)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error('ARCHIVE_FAILED');
      selectProfile('');
      setMessage('保存した商品を非表示にしました。');
      router.refresh();
    } catch {
      setMessage('商品を非表示にできませんでした。少し待ってから再度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  if (activeLinks.length === 0) {
    return (
      <div className="empty-state">
        <p>運営者が確認して「使用中」になったURLから投稿文を作れます。</p>
      </div>
    );
  }

  return (
    <form className="member-product-content" onSubmit={(event) => void saveAndGenerate(event)}>
      <label>
        保存した商品
        <select value={profileId} onChange={(event) => selectProfile(event.target.value)}>
          <option value="">新しい商品を登録</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}（{profile.externalTrackingSystemName}）
            </option>
          ))}
        </select>
      </label>
      <label>
        公式商品情報（任意）
        <select value={productPackId} onChange={(event) => setProductPackId(event.target.value)}>
          <option value="">紐付けない</option>
          {productMasters.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <small>運営者が公開した商品と関連付けます。</small>
      </label>
      {profileId && (
        <button
          className="button"
          type="button"
          disabled={saving}
          onClick={() => void archiveSelectedProfile()}
        >
          この保存商品を非表示にする
        </button>
      )}
      <label>
        使用するURL
        <select value={linkId} onChange={(event) => setLinkId(event.target.value)} required>
          {activeLinks.map((link) => (
            <option key={link.id} value={link.id}>
              {link.systemName}
            </option>
          ))}
        </select>
      </label>
      <label>
        商品・サービス名
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={160}
          placeholder="例：商品名"
        />
      </label>
      <label>
        伝えたいポイント
        <textarea
          value={appealPoint}
          onChange={(event) => setAppealPoint(event.target.value)}
          required
          maxLength={1000}
          rows={4}
          placeholder="確認できている特徴を、自分の言葉で入力してください"
        />
      </label>
      <label>
        届けたい相手（任意）
        <input
          value={targetAudience}
          onChange={(event) => setTargetAudience(event.target.value)}
          maxLength={500}
          placeholder="例：新しい習慣を始めたい方"
        />
      </label>
      <label>
        投稿先
        <select
          value={platform}
          onChange={(event) => setPlatform(event.target.value as MemberProductContentPlatform)}
        >
          {MEMBER_PRODUCT_CONTENT_PLATFORMS.map((value) => (
            <option key={value} value={value}>
              {platformLabel[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        投稿文に使う分身
        <select value={bunshinId} onChange={(event) => setBunshinId(event.target.value)} required>
          {bunshins.map((bunshin) => (
            <option key={bunshin.id} value={bunshin.id}>
              {bunshin.name}
            </option>
          ))}
        </select>
      </label>
      <p className="notice">
        価格・効果・在庫などは自動取得しません。事実を確認して入力してください。投稿文にはPR表記が入ります。
      </p>
      {bunshins.length === 0 && (
        <p className="notice">先に投稿パートナー（分身）を作成すると、AI投稿案を利用できます。</p>
      )}
      <button className="button button--primary button--full" type="submit" disabled={saving}>
        {saving ? '作成中…' : '商品情報を保存してAIで3案作る'}
      </button>
      {candidates.length > 0 && (
        <div className="member-product-content__result">
          <strong>使う案を選び、必要なら投稿前に直してください</strong>
          {candidates.map((candidate, index) => (
            <label className="member-product-content__candidate" key={index}>
              <span>
                <input
                  type="radio"
                  name="selected-product-candidate"
                  checked={selectedCandidate === index}
                  onChange={() => setSelectedCandidate(index)}
                />
                案{index + 1}
              </span>
              <textarea
                rows={9}
                value={candidate}
                onChange={(event) =>
                  setCandidates((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  )
                }
                onFocus={() => setSelectedCandidate(index)}
              />
            </label>
          ))}
          <button className="button button--full" type="button" onClick={() => void copy()}>
            選んだ投稿文をコピー
          </button>
          <button
            className="button button--primary button--full"
            type="button"
            disabled={saving || !activityId}
            onClick={() => void markPosted()}
          >
            SNSへの投稿完了を記録
          </button>
          <small>自動投稿はしません。コピー後、ご自身のSNSから投稿してください。</small>
        </div>
      )}
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
    </form>
  );
}
