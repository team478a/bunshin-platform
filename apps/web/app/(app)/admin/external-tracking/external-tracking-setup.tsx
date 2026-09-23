import type { ExternalTrackingConfiguration } from './external-tracking-types';

type TrackingSystem = ExternalTrackingConfiguration['systems'][number];
type TrackingDomain = TrackingSystem['allowedDomains'][number] & {
  systemId: string;
  systemName: string;
};

type Props = {
  busy: boolean;
  domains: TrackingDomain[];
  groupId: string;
  importErrors: Array<{ rowNumber: number; message: string }>;
  systems: TrackingSystem[];
  onImportCsv: (form: HTMLFormElement) => Promise<void>;
  onSend: (path: string, body: Record<string, unknown>) => Promise<boolean>;
};

export function ExternalTrackingSetup({
  busy,
  domains,
  groupId,
  importErrors,
  systems,
  onImportCsv,
  onSend,
}: Props) {
  return (
    <>
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
            void onSend('/systems', {
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
              void onSend('/domains', {
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
              void onSend('/links', {
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
              void onImportCsv(event.currentTarget);
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
    </>
  );
}
