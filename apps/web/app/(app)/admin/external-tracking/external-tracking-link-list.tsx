import type { ExternalTrackingConfiguration } from './external-tracking-types';

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

type Props = {
  busy: boolean;
  links: ExternalTrackingConfiguration['links'];
  onSend: (path: string, body: Record<string, unknown>) => Promise<boolean>;
};

export function ExternalTrackingLinkList({ busy, links, onSend }: Props) {
  return (
    <section className="settings-card" id="tracking-list">
      <h2>専用URL一覧</h2>
      {links.length ? (
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
              {links.map((link) => (
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
                    {link.expiresAt ? new Date(link.expiresAt).toLocaleString('ja-JP') : '期限なし'}
                  </td>
                  <td>
                    {link.effectiveStatus === 'DRAFT' && (
                      <div className="table-actions">
                        <button
                          disabled={busy}
                          onClick={() => void onSend(`/links/${link.id}/activate`, {})}
                        >
                          使用を始める
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void onSend(`/links/${link.id}/suspend`, {})}
                        >
                          修正をお願いする
                        </button>
                      </div>
                    )}
                    {link.effectiveStatus === 'ACTIVE' && (
                      <button
                        disabled={busy}
                        onClick={() => void onSend(`/links/${link.id}/suspend`, {})}
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
  );
}
