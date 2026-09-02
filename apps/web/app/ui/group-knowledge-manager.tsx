'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { compareGroupKnowledgeVersions } from '../../src/knowledge/group-knowledge-version-diff';

type SourceData = {
  id: string;
  type: 'PDF' | 'VIDEO' | 'URL' | 'TEXT';
  title: string;
  sourceUri: string | null;
  originalFileName: string | null;
  productPackVersionId: string | null;
  status: 'DRAFT' | 'PROCESSING' | 'REVIEW_REQUIRED' | 'ACTIVE' | 'FAILED' | 'ARCHIVED';
  version: number;
  failureCode: string | null;
  updatedAt: string;
};

type Source = SourceData & { generationCount: number; lastUsedAt: string | null };

const typeLabel = { PDF: 'PDF', VIDEO: '動画', URL: 'Webページ', TEXT: '入力した文章' } as const;
const statusLabel = {
  DRAFT: '読み取り待ち',
  PROCESSING: '読み取り中',
  REVIEW_REQUIRED: '内容の確認待ち',
  ACTIVE: '投稿づくりに利用中',
  FAILED: '読み取りに失敗',
  ARCHIVED: '利用停止',
} as const;

const failureMessage: Record<string, string> = {
  GROUP_KNOWLEDGE_PROVIDER_ERROR:
    '外部サービスが混み合っているか、一時的に接続できませんでした。もう一度読み取れます。',
  GROUP_KNOWLEDGE_VALIDATION_ERROR:
    '資料の内容または形式を読み取れませんでした。ファイルやURLを確認してください。',
  GROUP_KNOWLEDGE_FORBIDDEN: 'この資料を読み取る権限を確認できませんでした。',
  GROUP_KNOWLEDGE_NOT_FOUND: '登録した資料が見つかりませんでした。',
  GROUP_KNOWLEDGE_CONFLICT: '別の処理と重なりました。少し待ってからもう一度お試しください。',
  GROUP_KNOWLEDGE_WEB_RESPONSE_TOO_LARGE:
    'Webページ全体が2MBを超えています。必要な内容だけのページ、PDF、または文章で登録してください。',
  GROUP_KNOWLEDGE_WEB_TEXT_TOO_LARGE:
    'Webページの本文が長すぎます。内容を複数のページに分けて登録してください。',
  GROUP_KNOWLEDGE_VIDEO_TOO_LARGE:
    '動画が25MBを超えています。短く分けるか、画質を下げてから登録してください。',
  SOURCE_NOT_FOUND: '登録した資料が見つかりませんでした。',
  SOURCE_NOT_PROCESSABLE: 'この資料の形式には対応していません。',
};

function friendlyFailure(code: string) {
  return failureMessage[code] ?? '内容を読み取れませんでした。もう一度お試しください。';
}

function usageDateTime(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value));
}

function ProductScopeField({
  productVersions,
}: {
  productVersions: Array<{ id: string; label: string }>;
}) {
  return (
    <label className="field">
      <span className="field__label">この資料を使う範囲</span>
      <select className="field__control" name="productPackVersionId" defaultValue="">
        <option value="">グループのすべての投稿で使う</option>
        {productVersions.map((item) => (
          <option key={item.id} value={item.id}>
            商品「{item.label}」の投稿だけで使う
          </option>
        ))}
      </select>
      <small>商品専用の資料を選ぶと、その商品の投稿では共通資料より優先して使います。</small>
    </label>
  );
}

export function GroupKnowledgeManager({
  workspaceId,
  groupId,
  productVersions,
  initialSources,
}: {
  workspaceId: string;
  groupId: string;
  productVersions: Array<{ id: string; label: string }>;
  initialSources: Source[];
}) {
  const [sources, setSources] = useState(initialSources);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [scopeFilter, setScopeFilter] = useState('ALL');
  const [review, setReview] = useState<{
    source: Source;
    chunks: Array<{
      id: string;
      type: string;
      content: string;
      sourceLabel: string;
      pageNumber: number | null;
      startSeconds: number | null;
      endSeconds: number | null;
    }>;
    previousVersion: {
      version: number;
      chunks: Array<{ id: string; content: string }>;
    } | null;
  } | null>(null);
  const fileForm = useRef<HTMLFormElement>(null);
  const urlForm = useRef<HTMLFormElement>(null);
  const textForm = useRef<HTMLFormElement>(null);
  const refreshInFlight = useRef(false);

  const endpoint = `/api/workspaces/${workspaceId}/groups/${groupId}/knowledge`;
  const hasPendingSources = sources.some((source) =>
    ['DRAFT', 'PROCESSING'].includes(source.status),
  );

  const refreshSources = useCallback(
    async (announce: boolean) => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        const body = (await response.json()) as {
          data?: SourceData[];
          error?: { message?: string };
        };
        if (!response.ok || !body.data)
          throw new Error(body.error?.message ?? '最新の状態を確認できませんでした。');
        setSources((current) => {
          const usage = new Map(current.map((source) => [source.id, source]));
          return body.data!.map((source) => ({
            ...source,
            generationCount: usage.get(source.id)?.generationCount ?? 0,
            lastUsedAt: usage.get(source.id)?.lastUsedAt ?? null,
          }));
        });
        if (announce) setMessage('最新の状態に更新しました。');
      } catch (error) {
        if (announce)
          setMessage(error instanceof Error ? error.message : '最新の状態を確認できませんでした。');
      } finally {
        refreshInFlight.current = false;
      }
    },
    [endpoint],
  );

  useEffect(() => {
    if (!hasPendingSources) return;
    const timer = window.setInterval(() => void refreshSources(false), 5000);
    return () => window.clearInterval(timer);
  }, [hasPendingSources, refreshSources]);
  const visibleSources = useMemo(() => {
    const query = searchText.trim().normalize('NFKC').toLocaleLowerCase('ja');
    return sources.filter((source) => {
      const matchesText =
        query.length === 0 ||
        [source.title, source.originalFileName, source.sourceUri]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.normalize('NFKC').toLocaleLowerCase('ja').includes(query));
      const matchesType = typeFilter === 'ALL' || source.type === typeFilter;
      const matchesStatus = statusFilter === 'ALL' || source.status === statusFilter;
      const matchesScope =
        scopeFilter === 'ALL' ||
        (scopeFilter === 'COMMON'
          ? source.productPackVersionId === null
          : source.productPackVersionId === scopeFilter);
      return matchesText && matchesType && matchesStatus && matchesScope;
    });
  }, [scopeFilter, searchText, sources, statusFilter, typeFilter]);

  const statusCounts = useMemo(
    () => ({
      active: sources.filter((source) => source.status === 'ACTIVE').length,
      review: sources.filter((source) => source.status === 'REVIEW_REQUIRED').length,
      processing: sources.filter((source) => ['DRAFT', 'PROCESSING'].includes(source.status))
        .length,
      failed: sources.filter((source) => source.status === 'FAILED').length,
    }),
    [sources],
  );

  function selectedProductVersion(values: FormData) {
    const value = values.get('productPackVersionId');
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  function add(source: SourceData) {
    setSources((current) => {
      const previous = current.find((item) => item.id === source.id);
      return [
        {
          ...source,
          generationCount: previous?.generationCount ?? 0,
          lastUsedAt: previous?.lastUsedAt ?? null,
        },
        ...current.filter((item) => item.id !== source.id),
      ];
    });
  }

  async function parse(response: Response) {
    const body = (await response.json()) as {
      data?: {
        source?: SourceData;
        upload?: { method: 'PUT'; uploadUrl: string; headers: Record<string, string> };
      };
      error?: { message?: string };
    };
    if (!response.ok || !body.data?.source)
      throw new Error(body.error?.message ?? '保存できませんでした。');
    return body.data;
  }

  async function saveFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const files = values
      .getAll('file')
      .filter((value): value is File => value instanceof File && value.size > 0);
    const title = values.get('title');
    if (files.length === 0 || typeof title !== 'string') return;
    if (files.length > 10) {
      setMessage('一度に追加できるのは10件までです。10件ずつに分けて選んでください。');
      return;
    }
    const invalid = files.filter((file) => {
      if (!['application/pdf', 'video/mp4', 'video/quicktime'].includes(file.type)) return true;
      const maximum = file.type === 'application/pdf' ? 50_000_000 : 25_000_000;
      return file.size > maximum;
    });
    if (invalid.length > 0) {
      setMessage(
        `追加できないファイルがあります：${invalid.map((file) => file.name).join('、')}。PDFは50MB、動画は25MBまでです。`,
      );
      return;
    }
    setSaving(true);
    const saved: SourceData[] = [];
    const failed: string[] = [];
    for (const [index, file] of files.entries()) {
      setMessage(`${files.length}件中${index + 1}件目「${file.name}」を送信しています…`);
      try {
        const type = file.type === 'application/pdf' ? 'PDF' : 'VIDEO';
        const prepared = await parse(
          await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              type,
              title:
                files.length === 1 && title.trim()
                  ? title.trim()
                  : file.name.replace(/\.[^.]+$/u, ''),
              originalFileName: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
              rightsConfirmed: values.get('rightsConfirmed') === 'on',
              productPackVersionId: selectedProductVersion(values),
            }),
          }),
        );
        if (!prepared.upload) throw new Error('アップロードを準備できませんでした。');
        const uploaded = await fetch(prepared.upload.uploadUrl, {
          method: prepared.upload.method,
          headers: prepared.upload.headers,
          body: file,
        });
        if (!uploaded.ok) throw new Error('ファイルを送信できませんでした。');
        const completed = await fetch(`${endpoint}/${prepared.source!.id}/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sizeBytes: file.size }),
        });
        if (!completed.ok) throw new Error('ファイルを確認できませんでした。');
        saved.push(prepared.source!);
      } catch {
        failed.push(file.name);
      }
    }
    setSources((current) => [
      ...saved.map((source) => ({
        ...source,
        generationCount: 0,
        lastUsedAt: null,
      })),
      ...current.filter((item) => !saved.some((source) => source.id === item.id)),
    ]);
    fileForm.current?.reset();
    setMessage(
      failed.length === 0
        ? `${saved.length}件を保存しました。内容の読み取りが始まるまでお待ちください。`
        : `${saved.length}件を保存しました。保存できなかったファイル：${failed.join('、')}。失敗したファイルだけ、もう一度お試しください。`,
    );
    setSaving(false);
  }

  async function saveSimple(event: FormEvent<HTMLFormElement>, type: 'URL' | 'TEXT') {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const title = values.get('title');
    if (typeof title !== 'string') return;
    const sourceUri = values.get('sourceUri');
    setSaving(true);
    setMessage('保存しています…');
    try {
      const payload =
        type === 'URL'
          ? {
              type,
              title:
                title.trim() ||
                (() => {
                  try {
                    return new URL(typeof sourceUri === 'string' ? sourceUri : '').hostname;
                  } catch {
                    return '登録したWebページ';
                  }
                })(),
              sourceUri,
              productPackVersionId: selectedProductVersion(values),
            }
          : {
              type,
              title: title.trim() || '入力したFAQ',
              content: values.get('content'),
              productPackVersionId: selectedProductVersion(values),
            };
      const saved = await parse(
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
      add(saved.source!);
      (type === 'URL' ? urlForm : textForm).current?.reset();
      setMessage(
        type === 'TEXT'
          ? '保存しました。内容を確認すると投稿づくりに使えます。'
          : '保存しました。Webページの読み取りが始まるまでお待ちください。',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  async function refreshUrlSource(source: Source) {
    if (source.type !== 'URL' || !source.sourceUri) return;
    setSaving(true);
    setMessage('Webページの新しい内容を読み取る準備をしています…');
    try {
      const saved = await parse(
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'URL',
            title: source.title,
            sourceUri: source.sourceUri,
            productPackVersionId: source.productPackVersionId,
          }),
        }),
      );
      add(saved.source!);
      setMessage(
        'Webページの新しい版を受け付けました。確認して承認するまでは、現在の承認済み情報を使い続けます。',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '新しい内容を取得できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  async function openReview(sourceId: string) {
    setSaving(true);
    setMessage('読み取った内容を開いています…');
    try {
      const response = await fetch(`${endpoint}/${sourceId}`, { cache: 'no-store' });
      const body = (await response.json()) as {
        data?: NonNullable<typeof review>;
        error?: { message?: string };
      };
      if (!response.ok || !body.data)
        throw new Error(body.error?.message ?? '内容を開けませんでした。');
      setReview(body.data);
      setMessage('内容を確認してください。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '内容を開けませんでした。');
    } finally {
      setSaving(false);
    }
  }

  async function changeState(sourceId: string, action: 'approve' | 'archive' | 'retry') {
    setSaving(true);
    setMessage(
      action === 'approve'
        ? '利用を開始しています…'
        : action === 'archive'
          ? '利用を停止しています…'
          : 'もう一度読み取る準備をしています…',
    );
    try {
      const response = await fetch(`${endpoint}/${sourceId}/${action}`, { method: 'POST' });
      const body = (await response.json()) as {
        data?: { source: SourceData };
        error?: { message?: string };
      };
      if (!response.ok || !body.data?.source)
        throw new Error(body.error?.message ?? '変更できませんでした。');
      add(body.data.source);
      setReview(null);
      setMessage(
        action === 'approve'
          ? '投稿づくりに利用する資料として承認しました。'
          : action === 'archive'
            ? 'この資料の利用を停止しました。'
            : '再読み取りを受け付けました。少し待ってから画面を更新してください。',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '変更できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  async function saveReview() {
    if (!review || review.source.status !== 'REVIEW_REQUIRED') return false;
    setSaving(true);
    setMessage('修正した内容を保存しています…');
    try {
      const response = await fetch(`${endpoint}/${review.source.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chunks: review.chunks.map((chunk) => ({ id: chunk.id, content: chunk.content })),
        }),
      });
      const body = (await response.json()) as {
        data?: { chunks: Array<{ id: string; content: string }> };
        error?: { message?: string };
      };
      if (!response.ok || !body.data)
        throw new Error(body.error?.message ?? '修正した内容を保存できませんでした。');
      const saved = new Map(body.data.chunks.map((chunk) => [chunk.id, chunk.content]));
      setReview((current) =>
        current
          ? {
              ...current,
              chunks: current.chunks.map((chunk) => ({
                ...chunk,
                content: saved.get(chunk.id) ?? chunk.content,
              })),
            }
          : null,
      );
      setMessage('修正した内容を保存しました。確認後に利用を開始してください。');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '修正した内容を保存できませんでした。');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function changeProductScope(event: FormEvent<HTMLFormElement>, sourceId: string) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setSaving(true);
    setMessage('資料を使う範囲を変更しています…');
    try {
      const response = await fetch(`${endpoint}/${sourceId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productPackVersionId: selectedProductVersion(values) }),
      });
      const body = (await response.json()) as {
        data?: { source: Source };
        error?: { message?: string };
      };
      if (!response.ok || !body.data?.source)
        throw new Error(body.error?.message ?? '使う範囲を変更できませんでした。');
      add(body.data.source);
      setMessage('この資料を使う範囲を変更しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '使う範囲を変更できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="settings-card knowledge-upload-card">
        <div className="knowledge-section-heading">
          <div>
            <p className="eyebrow">いちばん簡単な方法</p>
            <h2>資料をアップロード</h2>
          </div>
          <span className="knowledge-type-badge">PDF・動画</span>
        </div>
        <p>PDFや動画をまとめて選べます。資料名はファイル名から自動で入ります。</p>
        <form ref={fileForm} className="form-stack" onSubmit={(event) => void saveFile(event)}>
          <label className="field">
            <span className="field__label">ファイルを選ぶ</span>
            <input
              className="field__control"
              name="file"
              type="file"
              accept="application/pdf,video/mp4,video/quicktime"
              multiple
              required
            />
            <small>一度に10件まで選べます。PDFは1件50MBまで、動画は1件25MBまでです。</small>
          </label>
          <label className="field">
            <span className="field__label">1件だけ選ぶ場合の名前（書かなくても大丈夫）</span>
            <input
              className="field__control"
              name="title"
              maxLength={200}
              placeholder="空欄ならファイル名を使います"
            />
          </label>
          <ProductScopeField productVersions={productVersions} />
          <label className="field">
            <span>
              <input name="rightsConfirmed" type="checkbox" required />
              この資料をワタシワークスで使っても大丈夫です
            </span>
          </label>
          <button className="button button--primary" type="submit" disabled={saving}>
            選んだ資料をまとめて追加する
          </button>
        </form>
      </section>

      <section className="settings-card knowledge-add-card">
        <div className="knowledge-section-heading">
          <h2>公式Webページを追加</h2>
          <span className="knowledge-type-badge">URL</span>
        </div>
        <p>商品ページや公開FAQのURLを登録できます。</p>
        <form
          ref={urlForm}
          className="form-stack"
          onSubmit={(event) => void saveSimple(event, 'URL')}
        >
          <label className="field">
            <span className="field__label">名前（書かなくても大丈夫）</span>
            <input className="field__control" name="title" maxLength={200} />
          </label>
          <label className="field">
            <span className="field__label">WebページのURL</span>
            <input
              className="field__control"
              name="sourceUri"
              type="url"
              inputMode="url"
              required
              placeholder="https://example.jp/faq"
            />
          </label>
          <ProductScopeField productVersions={productVersions} />
          <button className="button button--primary" type="submit" disabled={saving}>
            Webページを保存する
          </button>
        </form>
      </section>

      <section className="settings-card knowledge-add-card">
        <div className="knowledge-section-heading">
          <h2>文章を直接追加</h2>
          <span className="knowledge-type-badge">FAQ・説明文</span>
        </div>
        <p>短いFAQや社内で決めた説明文は、そのまま入力できます。</p>
        <form
          ref={textForm}
          className="form-stack"
          onSubmit={(event) => void saveSimple(event, 'TEXT')}
        >
          <label className="field">
            <span className="field__label">名前（書かなくても大丈夫）</span>
            <input className="field__control" name="title" maxLength={200} />
          </label>
          <label className="field">
            <span className="field__label">内容</span>
            <textarea
              className="field__control"
              name="content"
              maxLength={8000}
              rows={8}
              required
              placeholder="例：Q. 返品できますか？ A. 商品到着後7日以内に…"
            />
          </label>
          <ProductScopeField productVersions={productVersions} />
          <button className="button button--primary" type="submit" disabled={saving}>
            文章を保存する
          </button>
        </form>
      </section>

      {message ? (
        <p className="notice notice--success" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}

      {review ? (
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
                    <li
                      key={`${row.index}-${row.previous?.id ?? 'none'}-${row.current?.id ?? 'none'}`}
                    >
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
      ) : null}

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
                <span
                  className={`knowledge-status knowledge-status--${source.status.toLowerCase()}`}
                >
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
                  {friendlyFailure(source.failureCode)}
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
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void openReview(source.id)}
                  >
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
              {['FAILED', 'REVIEW_REQUIRED'].includes(source.status) ? (
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
    </>
  );
}
