import type { Dispatch, SetStateAction } from 'react';
import { compareGroupKnowledgeVersions } from '../../src/knowledge/group-knowledge-version-diff';
import type { GroupKnowledgeReview } from './group-knowledge-types';

export function GroupKnowledgeReviewPanel({
  review,
  setReview,
  saving,
  saveReview,
  changeState,
}: {
  review: GroupKnowledgeReview;
  setReview: Dispatch<SetStateAction<GroupKnowledgeReview | null>>;
  saving: boolean;
  saveReview: () => Promise<boolean>;
  changeState: (sourceId: string, action: 'approve' | 'archive' | 'retry') => Promise<void>;
}) {
  return (
    <section className="settings-card">
      <h2>読み取った内容を確認</h2>
      <p>
        <strong>{review.source.title}</strong>
      </p>
      {review.previousVersion ? (
        <details>
          <summary>前の第{review.previousVersion.version}版との違いを確認する</summary>
          <p>左がこれまで使っていた内容、右が今回の内容です。</p>
          <ul className="plain-list">
            {compareGroupKnowledgeVersions(review.previousVersion.chunks, review.chunks).map(
              (row) => (
                <li key={`${row.index}-${row.previous?.id ?? 'none'}-${row.current?.id ?? 'none'}`}>
                  <strong>
                    {row.status === 'UNCHANGED'
                      ? '変更なし'
                      : row.status === 'CHANGED'
                        ? '内容が変わりました'
                        : row.status === 'ADDED'
                          ? '新しく追加されました'
                          : '今回の版では削除されました'}
                  </strong>
                  <div className="form-grid">
                    <div>
                      <small>前の内容</small>
                      <p>{row.previous?.content ?? 'ありません'}</p>
                    </div>
                    <div>
                      <small>今回の内容</small>
                      <p>{row.current?.content ?? 'ありません'}</p>
                    </div>
                  </div>
                </li>
              ),
            )}
          </ul>
        </details>
      ) : null}
      {review.chunks.length === 0 ? (
        <p>読み取った内容はまだありません。</p>
      ) : (
        <ol className="plain-list">
          {review.chunks.map((chunk) => (
            <li key={chunk.id}>
              <strong>{chunk.sourceLabel}</strong>
              {chunk.pageNumber ? `（${chunk.pageNumber}ページ）` : ''}
              {chunk.startSeconds !== null ? `（${chunk.startSeconds}秒から）` : ''}
              {review.source.status === 'REVIEW_REQUIRED' ? (
                <textarea
                  className="field__control"
                  rows={6}
                  maxLength={8000}
                  value={chunk.content}
                  aria-label={`${chunk.sourceLabel}の読み取り内容`}
                  onChange={(event) =>
                    setReview((current) =>
                      current
                        ? {
                            ...current,
                            chunks: current.chunks.map((item) =>
                              item.id === chunk.id
                                ? { ...item, content: event.target.value }
                                : item,
                            ),
                          }
                        : null,
                    )
                  }
                />
              ) : (
                <p>{chunk.content}</p>
              )}
            </li>
          ))}
        </ol>
      )}
      {review.source.status === 'REVIEW_REQUIRED' && review.chunks.length > 0 ? (
        <>
          <button type="button" disabled={saving} onClick={() => void saveReview()}>
            修正した内容を保存する
          </button>
          <button
            className="button"
            type="button"
            disabled={saving}
            onClick={() =>
              void (async () => {
                if (await saveReview()) await changeState(review.source.id, 'approve');
              })()
            }
          >
            確認して投稿づくりに使う
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void changeState(review.source.id, 'retry')}
          >
            内容をもう一度読み取る
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void changeState(review.source.id, 'archive')}
          >
            この資料を使わない
          </button>
        </>
      ) : null}
      <button type="button" disabled={saving} onClick={() => setReview(null)}>
        閉じる
      </button>
    </section>
  );
}
