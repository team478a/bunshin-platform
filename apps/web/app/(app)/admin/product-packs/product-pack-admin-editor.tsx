'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { parseProductPackAssets, parseProductPackFacts, parseProductPackRules } from './view-model';

type Group = { id: string; name: string };
type Version = {
  id: string;
  version: number;
  status: string;
  providerName: string;
  summary: string;
};
type Assignment = { id: string; status: string };
type Pack = {
  id: string;
  name: string;
  status: string;
  group: Group;
  versions: Version[];
  assignments: Assignment[];
};

const formText = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
};

async function api(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body === undefined
      ? { method: 'POST' }
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const result = (await response.json()) as { data?: unknown; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message ?? '処理できませんでした。');
  return result.data;
}

export function ProductPackAdminEditor({
  workspaceId,
  groups,
  initialPacks,
  apiBase,
}: {
  workspaceId: string;
  groups: Group[];
  initialPacks: unknown[];
  apiBase?: string;
}) {
  const [packs, setPacks] = useState(initialPacks as Pack[]);
  const [message, setMessage] = useState('');
  const reload = async () => {
    const response = await fetch(apiBase ?? `/api/workspaces/${workspaceId}/product-packs`, {
      cache: 'no-store',
    });
    const result = (await response.json()) as { data: Pack[] };
    setPacks(result.data);
  };
  const run = async (operation: () => Promise<unknown>) => {
    setMessage('処理しています…');
    try {
      await operation();
      await reload();
      setMessage('保存しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '処理できませんでした。');
    }
  };
  const createPack = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(async () => {
      await api(apiBase ?? `/api/workspaces/${workspaceId}/product-packs`, {
        groupId: formText(data, 'groupId'),
        name: formText(data, 'name'),
      });
      event.currentTarget.reset();
    });
  };
  const createVersion = (event: FormEvent<HTMLFormElement>, packId: string) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const facts = parseProductPackFacts(formText(data, 'facts'));
    const rules = parseProductPackRules({
      requiredDisclosures: formText(data, 'requiredDisclosures'),
      forbiddenExpressions: formText(data, 'forbiddenExpressions'),
      conditionalExpressions: formText(data, 'conditionalExpressions'),
    });
    const assets = parseProductPackAssets(formText(data, 'assets'));
    void run(() =>
      api(`${apiBase ?? `/api/workspaces/${workspaceId}/product-packs`}/${packId}/versions`, {
        summary: formText(data, 'summary'),
        providerName: formText(data, 'providerName'),
        targetCustomer: formText(data, 'targetCustomer'),
        facts,
        faq: [],
        suitableFor: [],
        unsuitableFor: [],
        allowLinklessPosts: data.get('allowLinklessPosts') === 'on',
        rules,
        assets,
        validFrom: null,
        validUntil: null,
      }),
    );
  };

  return (
    <>
      <section
        className="settings-card product-pack-create-card"
        aria-labelledby="create-pack-title"
      >
        <div className="product-pack-heading">
          <div>
            <p className="eyebrow">1. 商品を登録する</p>
            <h2 id="create-pack-title">新しい商品・活動情報を作る</h2>
          </div>
        </div>
        <p>商品ごとに1つ作成します。作成後に、投稿で使う公式情報や注意事項を追加できます。</p>
        {groups.length === 0 ? (
          <>
            <p>先に対象グループを作成してください。</p>
            <Link className="button button--primary" href="/admin/groups">
              グループを作成する
            </Link>
          </>
        ) : (
          <form className="form-stack" onSubmit={createPack}>
            <label className="field">
              <span className="field__label">対象のグループ</span>
              <select className="field__control" name="groupId" required>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">商品・活動の名前</span>
              <input
                className="field__control"
                name="name"
                required
                maxLength={160}
                placeholder="例：公式スターターコース"
              />
            </label>
            <button className="button button--primary" type="submit">
              次へ進む
            </button>
          </form>
        )}
      </section>
      {message ? (
        <p className="notice notice--success" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {packs.length === 0 ? (
        <section className="settings-card product-pack-empty-state">
          <h2>まだ商品・活動情報はありません</h2>
          <p>上の「次へ進む」から、最初の情報を作成してください。</p>
        </section>
      ) : (
        packs.map((pack) => (
          <section className="settings-card product-pack-card" key={pack.id}>
            <div className="product-pack-heading">
              <div>
                <p className="eyebrow">{pack.group.name}</p>
                <h2>{pack.name}</h2>
              </div>
              <span
                className={`product-pack-status product-pack-status--${pack.status.toLowerCase()}`}
              >
                {pack.status === 'ACTIVE' ? '利用中' : '停止中'}
              </span>
            </div>
            <p className="product-pack-meta">
              この商品を使っている投稿設定：{pack.assignments.length}件
            </p>
            <div className="product-pack-flow">
              <strong>2. 投稿で使う公式情報を下書き保存</strong>
              <span>下書き → 内容確認 → 公開 の順で進みます。</span>
            </div>
            <form
              className="form-stack product-pack-form"
              onSubmit={(event) => createVersion(event, pack.id)}
            >
              <label className="field">
                <span className="field__label">提供元・販売元</span>
                <input
                  className="field__control"
                  name="providerName"
                  required
                  maxLength={200}
                  placeholder="例：ワタシワークス株式会社"
                />
              </label>
              <label className="field">
                <span className="field__label">どんな人向けか</span>
                <textarea
                  className="field__control"
                  name="targetCustomer"
                  required
                  maxLength={1000}
                  rows={3}
                  placeholder="例：SNS発信をこれから始める人"
                />
              </label>
              <label className="field">
                <span className="field__label">短い説明</span>
                <textarea
                  className="field__control"
                  name="summary"
                  required
                  maxLength={1000}
                  rows={3}
                  placeholder="投稿を作るときに伝えたい、商品の要点を書きます。"
                />
              </label>
              <label className="field">
                <span className="field__label">確認済みの事実</span>
                <textarea
                  className="field__control"
                  name="facts"
                  required
                  rows={5}
                  placeholder={'価格=月額1,000円\n対象=SNS初心者'}
                />
                <small>
                  1行ずつ「項目=内容」の形で入力します。推測や未確認の情報は書かないでください。
                </small>
              </label>
              <label className="field">
                <span className="field__label">投稿に必ず入れる表記</span>
                <textarea
                  className="field__control"
                  name="requiredDisclosures"
                  rows={3}
                  placeholder="#PR"
                />
              </label>
              <label className="field">
                <span className="field__label">投稿で使ってはいけない表現</span>
                <textarea
                  className="field__control"
                  name="forbiddenExpressions"
                  rows={3}
                  placeholder="必ず成果が出る"
                />
              </label>
              <label className="field">
                <span className="field__label">条件によって必要になる表記</span>
                <textarea
                  className="field__control"
                  name="conditionalExpressions"
                  rows={3}
                  placeholder="価格を書く=&gt;税込価格であることを明記"
                />
              </label>
              <p className="product-pack-form__notice">
                ここで登録した内容は、投稿前の安全確認に使われます。秘密情報や個人情報は入力しないでください。
              </p>
              <label className="field">
                <span className="field__label">公式素材</span>
                <textarea
                  className="field__control"
                  name="assets"
                  rows={3}
                  placeholder="IMAGE|商品画像|https://example.com/item.png|SNS投稿に利用可"
                />
                <small>1行ずつ「種類｜名前｜httpsのURL｜利用条件」の形で入力します。</small>
              </label>
              <label className="check-row">
                <input type="checkbox" name="allowLinklessPosts" />
                <span>専用URLがなくても商品投稿を作れるようにする</span>
              </label>
              <p className="product-pack-form__notice">
                通常はチェックしません。専用URLがない商品投稿は、安全のため作成を止めます。
              </p>
              <button className="button button--primary" type="submit">
                公式情報を下書き保存する
              </button>
            </form>
            <h3 className="product-pack-card__subheading">保存した版</h3>
            {pack.versions.length === 0 ? (
              <p>まだありません。</p>
            ) : (
              <ul className="plain-list product-pack-version-list">
                {pack.versions.map((version) => (
                  <li key={version.id}>
                    <strong>第{version.version}版</strong>（
                    {version.status === 'PUBLISHED' ? '公開中' : '下書き'}）
                    <p>
                      {version.providerName}：{version.summary}
                    </p>
                    {version.status === 'DRAFT' ? (
                      <button
                        className="button button--primary"
                        type="button"
                        onClick={() =>
                          void run(() =>
                            api(
                              `${apiBase ?? `/api/workspaces/${workspaceId}/product-packs`}/${pack.id}/versions/${version.id}/publish`,
                            ),
                          )
                        }
                      >
                        この版を公開する
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {pack.status === 'ACTIVE' ? (
              <button
                className="button button--danger"
                type="button"
                onClick={() =>
                  window.confirm('利用中の割当も解除されます。停止しますか？') &&
                  void run(() =>
                    api(`/api/workspaces/${workspaceId}/product-packs/${pack.id}/suspend`),
                  )
                }
              >
                商品パックを停止する
              </button>
            ) : null}
          </section>
        ))
      )}
    </>
  );
}
