'use client';

import Image from 'next/image';
import type { Dispatch, SetStateAction } from 'react';
import type { SocialImagePayment } from '../../src/social-image-payment';
import {
  socialImageStatusText,
  type SocialImageMission,
  type SocialImageRequestView,
  type SocialImageSavedPhoto,
} from './social-image-workspace-model';

export function SocialImageWorkspaceView({
  workspaceId,
  groupId,
  missions,
  selected,
  selectedId,
  availableSavedPhotos,
  busy,
  referenceFile,
  referenceConsent,
  selectedPhotoId,
  payment,
  message,
  videoMessage,
  requestView,
  requestId,
  editingPage,
  revisionMode,
  revisionHeadline,
  revisionBody,
  photoInstruction,
  reviewReason,
  reviewNote,
  setSelectedId,
  setReferenceFile,
  setReferenceConsent,
  setSelectedPhotoId,
  setEditingPage,
  setRevisionMode,
  setRevisionHeadline,
  setRevisionBody,
  setPhotoInstruction,
  setReviewReason,
  setReviewNote,
  openRevision,
  revisePage,
  create,
  decide,
  createVideo,
}: {
  workspaceId: string;
  groupId: string;
  missions: SocialImageMission[];
  selected: SocialImageMission | null;
  selectedId: string;
  availableSavedPhotos: SocialImageSavedPhoto[];
  busy: boolean;
  referenceFile: File | null;
  referenceConsent: boolean;
  selectedPhotoId: string;
  payment: SocialImagePayment;
  message: string | null;
  videoMessage: string | null;
  requestView: SocialImageRequestView | null;
  requestId: string | null;
  editingPage: number | null;
  revisionMode: 'TEXT' | 'PHOTO' | 'BOTH';
  revisionHeadline: string;
  revisionBody: string;
  photoInstruction: string;
  reviewReason: string;
  reviewNote: string;
  setSelectedId: Dispatch<SetStateAction<string>>;
  setReferenceFile: Dispatch<SetStateAction<File | null>>;
  setReferenceConsent: Dispatch<SetStateAction<boolean>>;
  setSelectedPhotoId: Dispatch<SetStateAction<string>>;
  setEditingPage: Dispatch<SetStateAction<number | null>>;
  setRevisionMode: Dispatch<SetStateAction<'TEXT' | 'PHOTO' | 'BOTH'>>;
  setRevisionHeadline: Dispatch<SetStateAction<string>>;
  setRevisionBody: Dispatch<SetStateAction<string>>;
  setPhotoInstruction: Dispatch<SetStateAction<string>>;
  setReviewReason: Dispatch<SetStateAction<string>>;
  setReviewNote: Dispatch<SetStateAction<string>>;
  openRevision: (pageIndex: number) => void;
  revisePage: () => Promise<void>;
  create: () => Promise<void>;
  decide: (decision: 'ADOPTED' | 'REJECTED') => Promise<void>;
  createVideo: () => Promise<void>;
}) {
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
          {availableSavedPhotos.length ? (
            <fieldset className="saved-photo-picker">
              <legend>保存した写真から選ぶ</legend>
              <label className="saved-photo-picker__none">
                <input
                  type="radio"
                  name="savedPhoto"
                  value=""
                  checked={!selectedPhotoId}
                  disabled={busy}
                  onChange={() => setSelectedPhotoId('')}
                />
                保存写真を使わない
              </label>
              <div className="saved-photo-picker__grid">
                {availableSavedPhotos.map((photo) => (
                  <label className="saved-photo-picker__item" key={photo.id}>
                    <input
                      type="radio"
                      name="savedPhoto"
                      value={photo.id}
                      checked={selectedPhotoId === photo.id}
                      disabled={busy}
                      onChange={() => {
                        setSelectedPhotoId(photo.id);
                        setReferenceFile(null);
                        setReferenceConsent(false);
                      }}
                    />
                    <Image
                      src={`/api/workspaces/${workspaceId}/groups/${groupId}/bunshins/${photo.bunshinId}/saved-photos/${photo.id}`}
                      alt={photo.label || '保存した写真'}
                      width={photo.width ?? 320}
                      height={photo.height ?? 240}
                      unoptimized
                    />
                    <span>
                      {photo.label || new Date(photo.createdAt).toLocaleDateString('ja-JP')}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p>
              保存した写真はまだありません。「今日やること」で写真を登録すると、次回から選べます。
            </p>
          )}
          <label htmlFor="image-reference">新しい写真を選ぶ（なくても作れます）</label>
          <input
            key={`${selectedId}-${selectedPhotoId}`}
            id="image-reference"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              setReferenceFile(event.target.files?.[0] ?? null);
              setReferenceConsent(false);
              if (event.target.files?.[0]) setSelectedPhotoId('');
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
            <p>{socialImageStatusText[requestView.status] ?? '確認しています'}</p>
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
              <div className="form-stack">
                {requestView.media!.status === 'REJECTED' ? (
                  <p className="notice">送信済みです。理由を変えて、もう一度送ることもできます。</p>
                ) : null}
                <label className="field">
                  <span className="field__label">今回は使わない理由</span>
                  <select
                    className="field__control"
                    value={reviewReason}
                    onChange={(event) => setReviewReason(event.target.value)}
                    disabled={busy}
                  >
                    <option value="">選んでください</option>
                    <option value="TEXT_HARD_TO_READ">文字が読みにくい</option>
                    <option value="CONTENT_MISMATCH">内容が希望と違う</option>
                    <option value="PHOTO_UNNATURAL">写真が不自然</option>
                    <option value="DESIGN_UNAPPEALING">デザインが好みではない</option>
                    <option value="OTHER">その他</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">詳しく伝える（任意）</span>
                  <textarea
                    className="field__control"
                    value={reviewNote}
                    maxLength={500}
                    onChange={(event) => setReviewNote(event.target.value)}
                    disabled={busy}
                    placeholder="例：文字をもっと大きくしてほしい"
                  />
                </label>
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
                    理由を送って今回は使わない
                  </button>
                </div>
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
