'use client';

import {
  MEMBER_PRODUCT_CONTENT_PLATFORMS,
  createMemberProductContent,
  type MemberProductContentPlatform,
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
}: {
  serviceSlug: string;
  settings: MemberTrackingLinkSettings;
  profiles: MemberProductProfileRecord[];
}) {
  const router = useRouter();
  const activeLinks = settings.links.filter((link) => link.status === 'ACTIVE');
  const [profileId, setProfileId] = useState('');
  const [linkId, setLinkId] = useState(activeLinks[0]?.id ?? '');
  const [name, setName] = useState('');
  const [appealPoint, setAppealPoint] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [platform, setPlatform] = useState<MemberProductContentPlatform>('INSTAGRAM');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  function selectProfile(id: string) {
    setProfileId(id);
    setBody('');
    const profile = profiles.find((item) => item.id === id);
    if (!profile) {
      setLinkId(activeLinks[0]?.id ?? '');
      setName('');
      setAppealPoint('');
      setTargetAudience('');
      return;
    }
    setLinkId(profile.externalTrackingLinkId);
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
            name,
            appealPoint,
            targetAudience: targetAudience || null,
          }),
        },
      );
      if (!response.ok) throw new Error('SAVE_FAILED');
      const payload = (await response.json()) as { data: { id: string } };
      const result = createMemberProductContent({
        productName: name,
        appealPoint,
        targetAudience,
        approvedUrl: link.url,
        platform,
      });
      setBody(result.body);
      setMessage(
        `商品情報を保存し、投稿文を作成しました（${result.characterCount}/${result.characterLimit}文字）。`,
      );
      setProfileId(payload.data.id);
      router.refresh();
    } catch {
      setBody('');
      setMessage('保存または投稿文の作成ができませんでした。入力内容を確認してください。');
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      setMessage('投稿文をコピーしました。');
    } catch {
      setMessage('コピーできませんでした。投稿文を長押ししてコピーしてください。');
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
      <p className="notice">
        価格・効果・在庫などは自動取得しません。事実を確認して入力してください。投稿文にはPR表記が入ります。
      </p>
      <button className="button button--primary button--full" type="submit" disabled={saving}>
        {saving ? '保存中…' : '商品情報を保存して投稿文を作る'}
      </button>
      {body && (
        <div className="member-product-content__result">
          <label>
            投稿前に内容を確認してください
            <textarea
              readOnly
              rows={9}
              value={body}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button className="button button--full" type="button" onClick={() => void copy()}>
            投稿文をコピー
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
