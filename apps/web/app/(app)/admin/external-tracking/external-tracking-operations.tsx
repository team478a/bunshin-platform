'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ExternalTrackingLinkList } from './external-tracking-link-list';
import { ExternalTrackingResults } from './external-tracking-results';
import { ExternalTrackingSetup } from './external-tracking-setup';
import type {
  ExternalTrackingConfiguration,
  ExternalTrackingResultConnection,
} from './external-tracking-types';

export function ExternalTrackingOperations({
  workspaceId,
  groupId,
  initialConfiguration,
  apiBase,
}: {
  workspaceId: string;
  groupId: string;
  initialConfiguration: ExternalTrackingConfiguration;
  apiBase?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<Array<{ rowNumber: number; message: string }>>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [resultConnection, setResultConnection] = useState<ExternalTrackingResultConnection | null>(
    null,
  );
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
  async function createResultConnection(systemId: string) {
    setBusy(true);
    setMessage(null);
    setResultConnection(null);
    try {
      const response = await fetch(`${base}/systems/${systemId}/result-token`, { method: 'POST' });
      const payload = (await response.json()) as {
        data?: { token: string; endpointPath: string; endpointUrl: string };
      };
      if (!response.ok || !payload.data) {
        setMessage('自動取得の接続情報を作成できませんでした。');
        return;
      }
      setResultConnection(payload.data);
      setMessage('自動取得の接続情報を作成しました。秘密キーは今だけ表示されます。');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setMessage(successMessage);
  }
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
      <ExternalTrackingResults
        base={base}
        busy={busy}
        groupId={groupId}
        resultConnection={resultConnection}
        results={initialConfiguration.results}
        resultTotals={initialConfiguration.resultTotals}
        systems={systems}
        onCopyText={copyText}
        onCreateResultConnection={createResultConnection}
      />
      <ExternalTrackingSetup
        busy={busy}
        domains={domains}
        groupId={groupId}
        importErrors={importErrors}
        systems={systems}
        onImportCsv={importCsv}
        onSend={send}
      />
      <ExternalTrackingLinkList busy={busy} links={initialConfiguration.links} onSend={send} />
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
