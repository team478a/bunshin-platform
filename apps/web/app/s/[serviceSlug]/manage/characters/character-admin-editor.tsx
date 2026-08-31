'use client';
import { useState, type FormEvent } from 'react';
type Profile = {
  id: string;
  name: string;
  description: string;
  status: string;
  licenses: { id: string; version: number; rightsHolder: string }[];
  publishedVersion: { id: string; version: number } | null;
  references: {
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  }[];
};
export function CharacterAdminEditor({
  serviceSlug,
  profiles,
}: {
  serviceSlug: string;
  profiles: Profile[];
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const text = (data: FormData, name: string) => {
    const value = data.get(name);
    return typeof value === 'string' ? value : '';
  };
  const send = async (body: unknown, success: string) => {
    setSaving(true);
    setMessage('保存しています…');
    try {
      const response = await fetch(`/api/services/${serviceSlug}/ai-characters`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? '保存できませんでした。');
      setMessage(success);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
      setSaving(false);
    }
  };
  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void send(
      {
        action: 'CREATE_PROFILE',
        name: text(data, 'name'),
        description: text(data, 'description'),
      },
      'キャラクターを作成しました。',
    );
  };
  const license = (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const start = text(data, 'startsAt');
    const end = text(data, 'endsAt');
    void send(
      {
        action: 'ADD_LICENSE',
        characterProfileId: id,
        rightsHolder: text(data, 'rightsHolder'),
        commercialUseAllowed: data.has('commercialUseAllowed'),
        derivativeUseAllowed: data.has('derivativeUseAllowed'),
        redistributionAllowed: data.has('redistributionAllowed'),
        terms: text(data, 'terms'),
        startsAt: new Date(`${start}T00:00:00+09:00`).toISOString(),
        endsAt: end ? new Date(`${end}T23:59:59+09:00`).toISOString() : null,
        consentConfirmed: data.has('consentConfirmed'),
      },
      '利用許諾を記録しました。',
    );
  };
  const publish = (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void send(
      {
        action: 'PUBLISH_VERSION',
        characterProfileId: id,
        licenseVersionId: text(data, 'licenseVersionId'),
        appearance: text(data, 'appearance'),
        worldSetting: text(data, 'worldSetting'),
        basePrompt: text(data, 'basePrompt'),
        negativePrompt: text(data, 'negativePrompt'),
        safetyRules: text(data, 'safetyRules')
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      },
      '生成設定を公開しました。',
    );
  };
  const uploadReference = async (event: FormEvent<HTMLFormElement>, versionId: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!data.get('image') || !data.has('rightsConfirmed')) {
      setMessage('画像を選び、利用できる権利を確認してください。');
      return;
    }
    data.set('rightsConfirmed', 'true');
    setSaving(true);
    setMessage('画像を安全に保存しています…');
    try {
      const response = await fetch(
        `/api/services/${serviceSlug}/ai-characters/versions/${versionId}/references`,
        { method: 'POST', body: data },
      );
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(result.error?.message ?? '画像を保存できませんでした。');
      }
      setMessage('基準画像を保存しました。');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '画像を保存できませんでした。');
      setSaving(false);
    }
  };
  return (
    <>
      <p
        role="status"
        aria-live="polite"
        className={message ? 'notice notice--success' : undefined}
      >
        {message}
      </p>
      <section className="settings-card">
        <h2>新しいキャラクター</h2>
        <form className="form-stack" onSubmit={create}>
          <label className="field">
            <span className="field__label">キャラクター名</span>
            <input
              className="field__control"
              name="name"
              required
              maxLength={160}
              placeholder="例：元気な案内役 ミナ"
            />
          </label>
          <label className="field">
            <span className="field__label">どんな役割ですか？</span>
            <textarea
              className="field__control"
              name="description"
              required
              maxLength={1000}
              placeholder="例：SNS初心者へ明るく作り方を伝えるキャラクター"
            />
          </label>
          <button className="button button--primary" disabled={saving}>
            キャラクターを作る
          </button>
        </form>
      </section>
      {profiles.map((profile) => (
        <section className="settings-card" key={profile.id}>
          <h2>{profile.name}</h2>
          <p>{profile.description}</p>
          <p>
            生成設定：
            {profile.publishedVersion
              ? `第${profile.publishedVersion.version}版を使用中`
              : 'まだありません'}
          </p>
          <h3>1. 利用できる権利を記録</h3>
          <form className="form-stack" onSubmit={(event) => license(event, profile.id)}>
            <label className="field">
              <span className="field__label">権利を持つ人・会社</span>
              <input className="field__control" name="rightsHolder" required maxLength={300} />
            </label>
            <label>
              <input type="checkbox" name="commercialUseAllowed" /> 商品紹介など仕事で使える
            </label>
            <label>
              <input type="checkbox" name="derivativeUseAllowed" /> 見た目や動画を加工できる
            </label>
            <label>
              <input type="checkbox" name="redistributionAllowed" /> 完成物を参加者へ渡せる
            </label>
            <label className="field">
              <span className="field__label">利用条件</span>
              <textarea className="field__control" name="terms" required maxLength={3000} />
            </label>
            <label className="field">
              <span className="field__label">利用開始日</span>
              <input className="field__control" name="startsAt" type="date" required />
            </label>
            <label className="field">
              <span className="field__label">利用終了日（任意）</span>
              <input className="field__control" name="endsAt" type="date" />
            </label>
            <label>
              <input type="checkbox" name="consentConfirmed" required /> 権利者の許可を確認しました
            </label>
            <button className="button" disabled={saving}>
              利用許諾を記録
            </button>
          </form>
          <h3>2. 見た目と生成指示を公開</h3>
          {profile.licenses.length === 0 ? (
            <p>先に利用許諾を記録してください。</p>
          ) : (
            <form className="form-stack" onSubmit={(event) => publish(event, profile.id)}>
              <label className="field">
                <span className="field__label">使う利用許諾</span>
                <select className="field__control" name="licenseVersionId">
                  {profile.licenses.map((item) => (
                    <option value={item.id} key={item.id}>
                      第{item.version}版・{item.rightsHolder}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">見た目</span>
                <textarea className="field__control" name="appearance" required maxLength={2000} />
              </label>
              <label className="field">
                <span className="field__label">世界観・雰囲気</span>
                <textarea
                  className="field__control"
                  name="worldSetting"
                  required
                  maxLength={2000}
                />
              </label>
              <label className="field">
                <span className="field__label">画像・動画AIへ渡す基本指示</span>
                <textarea className="field__control" name="basePrompt" required maxLength={5000} />
              </label>
              <label className="field">
                <span className="field__label">出してはいけない内容</span>
                <textarea
                  className="field__control"
                  name="negativePrompt"
                  required
                  maxLength={3000}
                />
              </label>
              <label className="field">
                <span className="field__label">安全ルール（1行に1つ）</span>
                <textarea
                  className="field__control"
                  name="safetyRules"
                  required
                  placeholder={'実在人物に似せない\n未成年に見える表現を使わない'}
                />
              </label>
              <button className="button button--primary" disabled={saving}>
                この生成設定を公開
              </button>
            </form>
          )}
          <h3>3. 見た目の基準画像</h3>
          {!profile.publishedVersion ? (
            <p>先に生成設定を公開してください。</p>
          ) : (
            <>
              <p>
                AIが同じキャラクターを作りやすいように、正面など特徴が分かる画像を登録します。
                JPEG、PNG、WebPを20MBまで登録できます。
              </p>
              <form
                className="form-stack"
                onSubmit={(event) => {
                  void uploadReference(event, profile.publishedVersion!.id);
                }}
              >
                <label className="field">
                  <span className="field__label">基準にする画像</span>
                  <input
                    className="field__control"
                    type="file"
                    name="image"
                    accept="image/jpeg,image/png,image/webp"
                    required
                  />
                </label>
                <label>
                  <input type="checkbox" name="rightsConfirmed" required />
                  この画像をAI生成に利用できる権利を確認しました
                </label>
                <button className="button button--primary" disabled={saving}>
                  基準画像を保存
                </button>
              </form>
              {profile.references.length === 0 ? (
                <p>基準画像はまだありません。</p>
              ) : (
                <div className="form-stack">
                  <h4>保存した基準画像</h4>
                  {profile.references.map((asset) => (
                    <figure key={asset.id}>
                      <img
                        src={`/api/services/${serviceSlug}/ai-characters/references/${asset.id}/image`}
                        alt={`${profile.name}の基準画像 ${asset.originalFilename}`}
                        style={{ maxWidth: '360px', width: '100%', height: 'auto' }}
                      />
                      <figcaption>
                        {asset.originalFilename}（{Math.ceil(asset.sizeBytes / 1024)}KB）
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      ))}
    </>
  );
}
