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
  GROUP: 'サービス共通',
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
  apiBase,
}: {
  workspaceId: string;
  groupId: string;
  initialConfiguration: Configuration;
  apiBase?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<Array<{ rowNumber: number; message: string }>>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const base = apiBase ?? `/api/workspaces/${workspaceId}/external-tracking`;
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
  async function importCsv(form: HTMLFormElement) {
    setBusy(true);
    setMessage(null);
    setImportErrors([]);
    try {
      const response = await fetch(`${base}/import`, { method: 'POST', body: new FormData(form) });
      const payload = (await response.json()) as {
        data?: {
          total: number;
          imported: number;
          failed: number;
          results: Array<{ rowNumber: number; status: string; message: string }>;
        };
      };
      if (!response.ok || !payload.data) {
        setMessage('取り込めませんでした。ファイルと設定を確認してください。');
        return;
      }
      setMessage(
        `${payload.data.total}行中、${payload.data.imported}行を下書きで登録しました。失敗は${payload.data.failed}行です。`,
      );
      setImportErrors(
        payload.data.results
          .filter((item) => item.status === 'ERROR')
          .map(({ rowNumber, message }) => ({ rowNumber, message })),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="external-tracking-operations">
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
      <section className="settings-card external-tracking-operations__guide">
        <p className="eyebrow">最初の設定は4ステップです</p>
        <h2>紹介URLを投稿案へ入れるまで</h2>
        <ol>
          <li>利用する外部サービスを登録します。</li>
          <li>登録を許可するURLのドメインを指定します。</li>
          <li>参加者・商品・企画に合う紹介URLを登録します。</li>
          <li>下書きを確認して「使用を始める」を押します。</li>
        </ol>
        <nav aria-label="専用URL設定の項目" className="settings-anchor-nav">
          <a href="#tracking-system">1. 外部サービス</a>
          <a href="#tracking-domain">2. 許可ドメイン</a>
          <a href="#tracking-link">3. 専用URL</a>
          <a href="#tracking-list">4. 設定一覧</a>
        </nav>
      </section>
      <section className="settings-card" id="tracking-system">
        <h2>外部サービスを登録</h2>
        <form
          className="admin-form-grid"
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
      <section className="settings-card" id="tracking-domain">
        <h2>使ってよいドメインを登録</h2>
        {systems.length ? (
          <form
            className="admin-form-grid"
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
      <section className="settings-card" id="tracking-link">
        <h2>専用URLを登録</h2>
        {domains.length ? (
          <form
            className="admin-form-grid"
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
              この簡単登録ではサービス共通URLを作ります。参加者・商品・企画別はCSV取込で追加できます。
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
        <h2>CSVでまとめて登録</h2>
        <p>正常な行だけを下書きで登録します。失敗した行は、行番号と理由を表示します。</p>
        <p>
          見出し：
          <code>
            participant_id,email,external_member_id,agency_id,product_code,campaign_code,url_name,external_link_id,url,starts_at,expires_at
          </code>
        </p>
        {domains.length ? (
          <form
            className="admin-form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void importCsv(event.currentTarget);
            }}
          >
            <input type="hidden" name="groupId" value={groupId} />
            <label>
              外部サービス
              <select
                name="systemId"
                onChange={(event) => {
                  const form = event.currentTarget.form;
                  const first = domains.find((item) => item.systemId === event.currentTarget.value);
                  const domainSelect = form?.elements.namedItem('allowedDomainId');
                  if (first && domainSelect instanceof HTMLSelectElement)
                    domainSelect.value = first.id;
                }}
              >
                {systems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
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
              CSVファイル（最大5MB・1,000行）
              <input name="file" type="file" accept=".csv,text/csv" required />
            </label>
            <button disabled={busy}>取り込む</button>
          </form>
        ) : (
          <p>先に外部サービスと使ってよいドメインを登録してください。</p>
        )}
        {importErrors.length > 0 && (
          <div className="notice" role="alert">
            <strong>登録できなかった行</strong>
            <ul>
              {importErrors.map((item) => (
                <li key={item.rowNumber}>
                  {item.rowNumber}行目：{item.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <section className="settings-card" id="tracking-list">
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
                        <div className="table-actions">
                          <button
                            disabled={busy}
                            onClick={() => void send(`/links/${link.id}/activate`, {})}
                          >
                            使用を始める
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => void send(`/links/${link.id}/suspend`, {})}
                          >
                            修正をお願いする
                          </button>
                        </div>
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
    </div>
  );
}
