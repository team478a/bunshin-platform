'use client';

import { useState, type FormEvent } from 'react';
import { parseProductPackFacts } from './view-model';

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
}: {
  workspaceId: string;
  groups: Group[];
  initialPacks: unknown[];
}) {
  const [packs, setPacks] = useState(initialPacks as Pack[]);
  const [message, setMessage] = useState('');
  const reload = async () => {
    const response = await fetch(`/api/workspaces/${workspaceId}/product-packs`, {
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
      await api(`/api/workspaces/${workspaceId}/product-packs`, {
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
    void run(() =>
      api(`/api/workspaces/${workspaceId}/product-packs/${packId}/versions`, {
        summary: formText(data, 'summary'),
        providerName: formText(data, 'providerName'),
        targetCustomer: formText(data, 'targetCustomer'),
        facts,
        faq: [],
        suitableFor: [],
        unsuitableFor: [],
        rules: [],
        assets: [],
        validFrom: null,
        validUntil: null,
      }),
    );
  };

  return (
    <>
      <section className="settings-card" aria-labelledby="create-pack-title">
        <h2 id="create-pack-title">新しい商品パックを作る</h2>
        {groups.length === 0 ? (
          <p>先に対象グループを作成してください。</p>
        ) : (
          <form onSubmit={createPack}>
            <label>
              対象グループ
              <select name="groupId" required>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              商品パック名
              <input name="name" required maxLength={160} />
            </label>
            <button type="submit">作成する</button>
          </form>
        )}
      </section>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {packs.length === 0 ? (
        <p>商品パックはまだありません。</p>
      ) : (
        packs.map((pack) => (
          <section className="settings-card" key={pack.id}>
            <h2>{pack.name}</h2>
            <p>
              グループ：{pack.group.name} ／ 状態：{pack.status} ／ 利用中：
              {pack.assignments.length}件
            </p>
            <h3>新しい版を下書き保存</h3>
            <form onSubmit={(event) => createVersion(event, pack.id)}>
              <label>
                提供元
                <input name="providerName" required maxLength={200} />
              </label>
              <label>
                どんな人向けか
                <textarea name="targetCustomer" required maxLength={1000} />
              </label>
              <label>
                短い説明
                <textarea name="summary" required maxLength={1000} />
              </label>
              <label>
                確認済みの事実（1行に「項目=内容」）
                <textarea name="facts" required placeholder="価格=月額1,000円" />
              </label>
              <button type="submit">下書きを作る</button>
            </form>
            <h3>保存した版</h3>
            {pack.versions.length === 0 ? (
              <p>まだありません。</p>
            ) : (
              <ul>
                {pack.versions.map((version) => (
                  <li key={version.id}>
                    第{version.version}版（{version.status}） {version.providerName}：
                    {version.summary}
                    {version.status === 'DRAFT' ? (
                      <button
                        type="button"
                        onClick={() =>
                          void run(() =>
                            api(
                              `/api/workspaces/${workspaceId}/product-packs/${pack.id}/versions/${version.id}/publish`,
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
