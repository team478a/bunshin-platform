'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { GroupKnowledgeLibrary } from './group-knowledge-library';
import { GroupKnowledgeReviewPanel } from './group-knowledge-review-panel';
import { GroupKnowledgeSourceForms } from './group-knowledge-source-forms';
import type {
  GroupKnowledgeReview,
  GroupKnowledgeSource as Source,
  GroupKnowledgeSourceData as SourceData,
  ProductVersionOption,
} from './group-knowledge-types';

export function GroupKnowledgeManager({
  workspaceId,
  groupId,
  productVersions,
  initialSources,
}: {
  workspaceId: string;
  groupId: string;
  productVersions: ProductVersionOption[];
  initialSources: Source[];
}) {
  const [sources, setSources] = useState(initialSources);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [scopeFilter, setScopeFilter] = useState('ALL');
  const [review, setReview] = useState<GroupKnowledgeReview | null>(null);
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
      <GroupKnowledgeSourceForms
        fileForm={fileForm}
        urlForm={urlForm}
        textForm={textForm}
        productVersions={productVersions}
        saving={saving}
        saveFile={saveFile}
        saveSimple={saveSimple}
      />
      {message ? (
        <p className="notice notice--success" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {review ? (
        <GroupKnowledgeReviewPanel
          review={review}
          setReview={setReview}
          saving={saving}
          saveReview={saveReview}
          changeState={changeState}
        />
      ) : null}
      <GroupKnowledgeLibrary
        sources={sources}
        visibleSources={visibleSources}
        productVersions={productVersions}
        saving={saving}
        hasPendingSources={hasPendingSources}
        statusCounts={statusCounts}
        searchText={searchText}
        setSearchText={setSearchText}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        scopeFilter={scopeFilter}
        setScopeFilter={setScopeFilter}
        refreshSources={refreshSources}
        changeProductScope={changeProductScope}
        changeState={changeState}
        openReview={openReview}
        refreshUrlSource={refreshUrlSource}
      />
    </>
  );
}
