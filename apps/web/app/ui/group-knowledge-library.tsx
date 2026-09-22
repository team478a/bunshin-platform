import type { Dispatch, FormEvent, SetStateAction } from 'react';
import {
  friendlyGroupKnowledgeFailure,
  groupKnowledgeStatusLabel as statusLabel,
  groupKnowledgeTypeLabel as typeLabel,
  groupKnowledgeUsageDateTime as usageDateTime,
} from './group-knowledge-copy';
import type { GroupKnowledgeSource, ProductVersionOption } from './group-knowledge-types';

export function GroupKnowledgeLibrary({
  sources,
  visibleSources,
  productVersions,
  saving,
  hasPendingSources,
  statusCounts,
  searchText,
  setSearchText,
  typeFilter,
  setTypeFilter,
  statusFilter,
  setStatusFilter,
  scopeFilter,
  setScopeFilter,
  refreshSources,
  changeProductScope,
  changeState,
  openReview,
  refreshUrlSource,
}: {
  sources: GroupKnowledgeSource[];
  visibleSources: GroupKnowledgeSource[];
  productVersions: ProductVersionOption[];
  saving: boolean;
  hasPendingSources: boolean;
  statusCounts: { active: number; review: number; processing: number; failed: number };
  searchText: string;
  setSearchText: Dispatch<SetStateAction<string>>;
  typeFilter: string;
  setTypeFilter: Dispatch<SetStateAction<string>>;
  statusFilter: string;
  setStatusFilter: Dispatch<SetStateAction<string>>;
  scopeFilter: string;
  setScopeFilter: Dispatch<SetStateAction<string>>;
  refreshSources: (announce: boolean) => Promise<void>;
  changeProductScope: (event: FormEvent<HTMLFormElement>, sourceId: string) => Promise<void>;
  changeState: (sourceId: string, action: 'approve' | 'archive' | 'retry') => Promise<void>;
  openReview: (sourceId: string) => Promise<void>;
  refreshUrlSource: (source: GroupKnowledgeSource) => Promise<void>;
}) {
  return (
    <section className="settings-card knowledge-library-card">
      <h2>保存したナレッジ</h2>
      <div className="knowledge-status-summary" aria-label="登録した資料の状態">
        <span>
          すべて<strong>{sources.length}</strong>
        </span>
        <span>
          利用中<strong>{statusCounts.active}</strong>
        </span>
        <span>
          確認待ち<strong>{statusCounts.review}</strong>
        </span>
        <span>
          読み取り中<strong>{statusCounts.processing}</strong>
        </span>
        <span>
          失敗<strong>{statusCounts.failed}</strong>
        </span>
      </div>
      <button
        className="button button--secondary"
        type="button"
        disabled={saving}
        onClick={() => void refreshSources(true)}
      >
        最新の状態に更新する
      </button>
      {hasPendingSources ? (
        <p>読み取り中の資料は5秒ごとに自動確認します。この画面を開いたままで大丈夫です。</p>
      ) : null}
      <div className="form-grid">
        <label className="field">
          <span className="field__label">資料名で探す</span>
          <input
            className="field__control"
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="資料名、ファイル名、URL"
          />
        </label>
        <label className="field">
          <span className="field__label">資料の種類</span>
          <select
            className="field__control"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="ALL">すべて</option>
            <option value="PDF">PDF</option>
            <option value="VIDEO">動画</option>
            <option value="URL">Webページ</option>
            <option value="TEXT">入力した文章</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">現在の状態</span>
          <select
            className="field__control"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="ALL">すべて</option>
            {Object.entries(statusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">使う範囲</span>
          <select
            className="field__control"
            value={scopeFilter}
            onChange={(event) => setScopeFilter(event.target.value)}
          >
            <option value="ALL">すべて</option>
            <option value="COMMON">グループのすべての投稿</option>
            {productVersions.map((item) => (
              <option key={item.id} value={item.id}>
                商品「{item.label}」の投稿だけ
              </option>
            ))}
          </select>
        </label>
      </div>
      {searchText || typeFilter !== 'ALL' || statusFilter !== 'ALL' || scopeFilter !== 'ALL' ? (
        <button
          type="button"
          onClick={() => {
            setSearchText('');
            setTypeFilter('ALL');
            setStatusFilter('ALL');
            setScopeFilter('ALL');
          }}
        >
          絞り込みをすべて戻す
        </button>
      ) : null}
      {sources.length === 0 ? <p>保存した資料はまだありません。</p> : null}
      {sources.length > 0 && visibleSources.length === 0 ? (
        <p>条件に合う資料はありません。検索や絞り込みを変えてください。</p>
      ) : null}
      <ul className="plain-list knowledge-source-list">
        {visibleSources.map((source) => (
          <li key={source.id}>
            <div className="knowledge-source-list__heading">
              <div>
                <strong>{source.title}</strong>
                <span>
                  {typeLabel[source.type]} ／ 第{source.version}版
                </span>
              </div>
              <span className={`knowledge-status knowledge-status--${source.status.toLowerCase()}`}>
                {statusLabel[source.status]}
              </span>
            </div>
            <p className="knowledge-source-list__detail">
              投稿案での利用：
              {source.generationCount > 0 && source.lastUsedAt
                ? `${source.generationCount}回（最後：${usageDateTime(source.lastUsedAt)}）`
                : 'まだありません'}
            </p>
            <p className="knowledge-source-list__detail">
              使う範囲：
              {source.productPackVersionId
                ? `商品「${
                    productVersions.find((item) => item.id === source.productPackVersionId)
                      ?.label ?? '登録済みの商品'
                  }」の投稿だけ`
                : 'グループのすべての投稿'}
            </p>
            {source.status !== 'ARCHIVED' ? (
              <form
                key={`${source.id}-${source.productPackVersionId ?? 'common'}`}
                className="form-stack"
                onSubmit={(event) => void changeProductScope(event, source.id)}
              >
                <label className="field">
                  <span className="field__label">使う範囲を変更</span>
                  <select
                    className="field__control"
                    name="productPackVersionId"
                    defaultValue={source.productPackVersionId ?? ''}
                  >
                    <option value="">グループのすべての投稿</option>
                    {productVersions.map((item) => (
                      <option key={item.id} value={item.id}>
                        商品「{item.label}」の投稿だけ
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" disabled={saving}>
                  使う範囲を保存する
                </button>
              </form>
            ) : null}
            {source.originalFileName ? (
              <>
                <br />
                ファイル：{source.originalFileName}
              </>
            ) : null}
            {source.sourceUri ? (
              <>
                <br />
                登録先：{source.sourceUri}
              </>
            ) : null}
            {source.failureCode ? (
              <>
                <br />
                {friendlyGroupKnowledgeFailure(source.failureCode)}
              </>
            ) : null}
            {['FAILED', 'REVIEW_REQUIRED'].includes(source.status) ? (
              <>
                <br />
                <button
                  className="button"
                  type="button"
                  disabled={saving}
                  onClick={() => void changeState(source.id, 'retry')}
                >
                  {source.status === 'FAILED' ? 'もう一度読み取る' : '内容を読み取り直す'}
                </button>
              </>
            ) : null}
            {['REVIEW_REQUIRED', 'ACTIVE'].includes(source.status) ? (
              <>
                <br />
                <button type="button" disabled={saving} onClick={() => void openReview(source.id)}>
                  内容を確認する
                </button>
              </>
            ) : null}
            {source.status === 'ACTIVE' ? (
              <>
                {source.type === 'URL' &&
                (source.productPackVersionId === null ||
                  productVersions.some((item) => item.id === source.productPackVersionId)) ? (
                  <button
                    className="button"
                    type="button"
                    disabled={saving}
                    onClick={() => void refreshUrlSource(source)}
                  >
                    Webページの最新内容を読み取る
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void changeState(source.id, 'archive')}
                >
                  利用を停止する
                </button>
              </>
            ) : null}
            {['DRAFT', 'FAILED', 'REVIEW_REQUIRED'].includes(source.status) ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void changeState(source.id, 'archive')}
              >
                この資料を使わない
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
