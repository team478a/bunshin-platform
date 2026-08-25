'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Configuration = {
  systems: Array<{
    id: string;
    name: string;
    status: string;
    allowedDomains: Array<{ id: string; hostname: string; status: string }>;
  }>;
  links: Array<{
    id: string;
    name: string;
    url: string;
    scopeType: string;
    effectiveStatus: string;
    startsAt: string | null;
    expiresAt: string | null;
    system: { name: string };
    productPack: { name: string } | null;
    campaign: { name: string } | null;
  }>;
  members: Array<{
    id: string;
    role: string;
    consentedAt: string | null;
    identityConfigured: boolean;
    activeLinkCount: number;
    user: { displayName: string; email: string | null };
  }>;
  usages: Array<{
    id: string;
    createdAt: string;
    insertedUrlSnapshot: string;
    linkNameSnapshot: string;
    expiresAtSnapshot: string | null;
    groupMembership: { user: { displayName: string } };
    productPack: { name: string };
    campaign: { name: string } | null;
    dailyMission: { missionDate: string; format: string };
  }>;
  audits: Array<{ id: string; action: string; performedAt: string }>;
};

const statusLabel: Record<string, string> = {
  DRAFT: '下書き',
  ACTIVE: '使用中',
  SUSPENDED: '停止中',
  EXPIRED: '期限切れ',
  DELETED: '削除済み',
};
const scopeLabel: Record<string, string> = {
  GROUP: 'グループ共通',
  MEMBER: '参加者共通',
  PRODUCT: '商品共通',
  CAMPAIGN: '企画共通',
  PRODUCT_MEMBER: '商品＋参加者',
  CAMPAIGN_MEMBER: '企画＋参加者',
};

export function ExternalTrackingOperations({
  workspaceId,
  groupId,
  initialConfiguration,
}: {
  workspaceId: string;
  groupId: string;
  initialConfiguration: Configuration;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/workspaces/${workspaceId}/external-tracking`;
  async function send(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setMessage('保存できませんでした。入力内容と権限を確認してください。');
        return false;
      }
      setMessage('保存しました。');
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }
  const systems = initialConfiguration.systems.filter((item) => item.status === 'ACTIVE');
  const domains = systems.flatMap((system) =>
    system.allowedDomains.map((domain) => ({
      ...domain,
      systemId: system.id,
      systemName: system.name,
    })),
  );
  return (
    <>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <section className="settings-card">
        <h2>設定状況</h2>
        <p>
          参加者 {initialConfiguration.members.length}人 ／ 外部サービス {systems.length}件 ／
          使用中URL{' '}
          {initialConfiguration.links.filter((item) => item.effectiveStatus === 'ACTIVE').length}件
        </p>
        <p>
          設定が必要な参加者：
          {
            initialConfiguration.members.filter(
              (item) => !item.identityConfigured || item.activeLinkCount === 0,
            ).length
          }
          人
        </p>
        <a
          className="button button--secondary"
          href={`${base}/export?groupId=${groupId}&kind=links`}
        >
          URL一覧をCSVで保存
        </a>{' '}
        <a
          className="button button--secondary"
          href={`${base}/export?groupId=${groupId}&kind=usages`}
        >
          使用履歴をCSVで保存
        </a>
      </section>
      <section className="settings-card">
        <h2>外部サービスを登録</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void send('/systems', {
              groupId,
              name: data.get('name'),
              systemType: data.get('systemType'),
              externalSystemId: data.get('externalSystemId') || null,
            });
          }}
        >
          <label>
            サービス名
            <input name="name" required maxLength={160} />
          </label>
          <label>
            サービスの種類
            <input name="systemType" required maxLength={80} placeholder="代理店システム" />
          </label>
          <label>
            外部システムID（任意）
            <input name="externalSystemId" maxLength={255} />
          </label>
          <button disabled={busy}>登録する</button>
        </form>
      </section>
      <section className="settings-card">
        <h2>使ってよいドメインを登録</h2>
        {systems.length ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void send('/domains', {
                systemId: data.get('systemId'),
                hostname: data.get('hostname'),
                allowSubdomains: data.get('allowSubdomains') === 'on',
                shortener: false,
              });
            }}
          >
            <label>
              外部サービス
              <select name="systemId">
                {systems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ドメイン
              <input name="hostname" required placeholder="example.jp" />
            </label>
            <label>
              <input type="checkbox" name="allowSubdomains" /> 下の階層のドメインも許可する
            </label>
            <button disabled={busy}>登録する</button>
          </form>
        ) : (
          <p>先に外部サービスを登録してください。</p>
        )}
      </section>
      <section className="settings-card">
        <h2>専用URLを登録</h2>
        {domains.length ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const domain = domains.find((item) => item.id === data.get('allowedDomainId'));
              const startsAt = data.get('startsAt');
              const expiresAt = data.get('expiresAt');
              void send('/links', {
                systemId: domain?.systemId,
                allowedDomainId: data.get('allowedDomainId'),
                memberIdentityId: null,
                productPackId: null,
                campaignId: null,
                scopeType: 'GROUP',
                name: data.get('name'),
                externalLinkId: null,
                referralToken: null,
                url: data.get('url'),
                startsAt:
                  typeof startsAt === 'string' && startsAt
                    ? new Date(startsAt).toISOString()
                    : null,
                expiresAt:
                  typeof expiresAt === 'string' && expiresAt
                    ? new Date(expiresAt).toISOString()
                    : null,
                notes: data.get('notes') || null,
              });
            }}
          >
            <p>
              この簡単登録ではグループ共通URLを作ります。参加者・商品・企画別はCSV取込で追加予定です。
            </p>
            <label>
              URL名
              <input name="name" required maxLength={160} />
            </label>
            <label>
              許可ドメイン
              <select name="allowedDomainId">
                {domains.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.hostname}（{item.systemName}）
                  </option>
                ))}
              </select>
            </label>
            <label>
              専用URL
              <input
                name="url"
                type="url"
                required
                placeholder="https://example.jp/product?ref=..."
              />
            </label>
            <label>
              開始日時
              <input name="startsAt" type="datetime-local" />
            </label>
            <label>
              終了日時
              <input name="expiresAt" type="datetime-local" />
            </label>
            <label>
              メモ
              <textarea name="notes" maxLength={1000} />
            </label>
            <button disabled={busy}>下書きで登録する</button>
          </form>
        ) : (
          <p>先に使ってよいドメインを登録してください。</p>
        )}
      </section>
      <section className="settings-card">
        <h2>専用URL一覧</h2>
        {initialConfiguration.links.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>名前</th>
                  <th>対象</th>
                  <th>状態</th>
                  <th>期限</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {initialConfiguration.links.map((link) => (
                  <tr key={link.id}>
                    <td>
                      {link.name}
                      <br />
                      <small>{link.system.name}</small>
                    </td>
                    <td>
                      {scopeLabel[link.scopeType] ?? link.scopeType}
                      <br />
                      <small>{link.productPack?.name ?? link.campaign?.name ?? ''}</small>
                    </td>
                    <td>{statusLabel[link.effectiveStatus] ?? link.effectiveStatus}</td>
                    <td>
                      {link.expiresAt
                        ? new Date(link.expiresAt).toLocaleString('ja-JP')
                        : '期限なし'}
                    </td>
                    <td>
                      {link.effectiveStatus === 'DRAFT' && (
                        <button
                          disabled={busy}
                          onClick={() => void send(`/links/${link.id}/activate`, {})}
                        >
                          使用を始める
                        </button>
                      )}
                      {link.effectiveStatus === 'ACTIVE' && (
                        <button
                          disabled={busy}
                          onClick={() => void send(`/links/${link.id}/suspend`, {})}
                        >
                          停止する
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>専用URLはまだありません。</p>
        )}
      </section>
      <section className="settings-card">
        <h2>参加者別の設定漏れ</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>参加者</th>
                <th>外部ID</th>
                <th>参加者専用URL</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {initialConfiguration.members.map((member) => (
                <tr key={member.id}>
                  <td>
                    {member.user.displayName}
                    <br />
                    <small>{member.user.email ?? 'メールなし'}</small>
                  </td>
                  <td>{member.identityConfigured ? '設定済み' : '未設定'}</td>
                  <td>{member.activeLinkCount}件</td>
                  <td>
                    {!member.consentedAt
                      ? '参加同意待ち'
                      : !member.identityConfigured || member.activeLinkCount === 0
                        ? '設定が必要'
                        : '準備完了'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="settings-card">
        <h2>使用履歴</h2>
        {initialConfiguration.usages.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>日時</th>
                  <th>参加者</th>
                  <th>商品・企画</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {initialConfiguration.usages.map((usage) => (
                  <tr key={usage.id}>
                    <td>{new Date(usage.createdAt).toLocaleString('ja-JP')}</td>
                    <td>{usage.groupMembership.user.displayName}</td>
                    <td>
                      {usage.productPack.name}
                      <br />
                      <small>{usage.campaign?.name ?? ''}</small>
                    </td>
                    <td>
                      {usage.linkNameSnapshot}
                      <br />
                      <small>{usage.insertedUrlSnapshot}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>使用履歴はまだありません。</p>
        )}
      </section>
      <section className="settings-card">
        <h2>変更履歴</h2>
        <ul>
          {initialConfiguration.audits.slice(0, 20).map((audit) => (
            <li key={audit.id}>
              {new Date(audit.performedAt).toLocaleString('ja-JP')} — {audit.action}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
