'use client';
import { useState, type FormEvent } from 'react';

type Provider = 'OPENAI' | 'GROK' | 'EXA' | 'FIRECRAWL';
type Configuration = {
  id: string;
  provider: Provider;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ERROR';
  apiKeyConfigured: boolean;
  apiKeyMask: string | null;
  model: string | null;
  dailyBudgetUsdMicros: number;
  monthlyBudgetUsdMicros: number;
  requestCostUsdMicros?: number;
  globallyPaused: boolean;
  lastVerifiedAt: string | null;
  lastErrorCategory: string | null;
};
const labels: Record<Provider, string> = {
  OPENAI: '文章を作るAI（OpenAI）',
  GROK: 'Xの話題を調べるAI（Grok）',
  EXA: '話題を調べる検索（Exa）',
  FIRECRAWL: 'ウェブページを読む検索（Firecrawl）',
};
const usd = (micros: number) => (micros / 1_000_000).toFixed(2);
const connectionErrors: Record<string, string> = {
  CREDENTIAL_INVALID: 'APIキーが正しくないか、利用権限がありません',
  QUOTA_OR_RATE_LIMIT: '利用上限または短時間の回数制限に達しています',
  MODEL_UNAVAILABLE: '指定したAIモデルを利用できません',
  PROVIDER_CONFIGURATION_INVALID: '外部サービス側の設定を確認してください',
  PROVIDER_UNAVAILABLE: '外部サービスへ一時的に接続できません',
};

export function AiProviderConfigurationEditor(props: {
  environment: string;
  initialConfigurations: Configuration[];
}) {
  const [configurations, setConfigurations] = useState(props.initialConfigurations);
  const [provider, setProvider] = useState<Provider>('OPENAI');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionConfigurationId, setActionConfigurationId] = useState<string | null>(null);
  const [actionMessages, setActionMessages] = useState<Record<string, string>>({});

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/admin/ai-provider-configurations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          reason: form.get('reason'),
          model: provider === 'OPENAI' || provider === 'GROK' ? form.get('model') : null,
          dailyBudgetUsd: Number(form.get('dailyBudgetUsd')),
          monthlyBudgetUsd: Number(form.get('monthlyBudgetUsd')),
          requestCostUsd: Number(form.get('requestCostUsd')),
          apiKey: form.get('apiKey') || null,
        }),
      });
      const result = (await response.json()) as {
        data?: Configuration;
        error?: { message?: string };
      };
      if (!response.ok || !result.data)
        setMessage(result.error?.message ?? '保存できませんでした。');
      else {
        setConfigurations((current) => [result.data!, ...current]);
        setMessage('停止中の下書きを保存しました。まだ外部サービスには接続しません。');
        event.currentTarget.reset();
      }
    } catch {
      setMessage('通信に失敗しました。画面を再読み込みして、もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  async function action(id: string, name: 'test' | 'activate' | 'pause') {
    const reason = name === 'test' ? null : window.prompt('操作する理由を入力してください。');
    if (name !== 'test' && !reason) return;
    if (
      name === 'activate' &&
      props.environment === 'PRODUCTION' &&
      !window.confirm('本番で外部サービスを使い始めます。接続確認と予算を確認しましたか？')
    )
      return;
    setActionConfigurationId(id);
    setMessage('');
    setActionMessages((current) => ({
      ...current,
      [id]: name === 'test' ? '接続を確認しています。少しお待ちください…' : '変更しています…',
    }));
    try {
      const response = await fetch(`/api/admin/ai-provider-configurations/${id}/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        ...(reason ? { body: JSON.stringify({ reason }) } : {}),
      });
      const result = (await response.json()) as {
        data?: Configuration | { success: boolean; errorCategory: string | null };
        error?: { message?: string };
      };
      if (!response.ok || !result.data) {
        setActionMessages((current) => ({
          ...current,
          [id]: result.error?.message ?? '操作できませんでした。',
        }));
      } else if (name === 'test') {
        const tested = result.data as { success: boolean; errorCategory: string | null };
        const testedAt = new Date().toISOString();
        setConfigurations((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, lastVerifiedAt: testedAt, lastErrorCategory: tested.errorCategory }
              : item,
          ),
        );
        setActionMessages((current) => ({
          ...current,
          [id]: tested.success
            ? '接続できました。次に「この設定を使い始める」を押してください。'
            : `接続できませんでした：${connectionErrors[tested.errorCategory ?? ''] ?? '原因を確認できませんでした'}`,
        }));
      } else {
        const updated = result.data as Configuration;
        setConfigurations((current) =>
          current.map((item) =>
            item.id === updated.id
              ? updated
              : name === 'activate' &&
                  item.provider === updated.provider &&
                  item.status === 'ACTIVE'
                ? { ...item, status: 'DISABLED', globallyPaused: true }
                : item,
          ),
        );
        setActionMessages((current) => ({
          ...current,
          [id]: name === 'activate' ? 'この設定を使い始めました。' : 'すぐに停止しました。',
        }));
      }
    } catch {
      setActionMessages((current) => ({
        ...current,
        [id]: '通信に失敗しました。画面を再読み込みして、もう一度お試しください。',
      }));
    } finally {
      setActionConfigurationId(null);
    }
  }

  return (
    <>
      <section className="settings-card">
        <h2>現在の設定状況</h2>
        <p>未登録のサービスも表示しています。秘密の値は保存後に再表示しません。</p>
        <div className="settings-status-list">
          {(Object.keys(labels) as Provider[]).map((value) => {
            const item = configurations.find((configuration) => configuration.provider === value);
            return (
              <article className="settings-status-item" key={value}>
                <h3>{labels[value]}</h3>
                <p>登録：{item?.apiKeyConfigured ? (item.apiKeyMask ?? '登録済み') : '未登録'}</p>
                <p>
                  接続：
                  {!item?.lastVerifiedAt
                    ? '未確認'
                    : item.lastErrorCategory
                      ? 'エラー'
                      : '確認済み'}
                  ／ 使用：{item?.status === 'ACTIVE' ? '使用中' : '停止中'}
                </p>
                <p>
                  次にすること：
                  {!item?.apiKeyConfigured
                    ? 'APIキーを登録する'
                    : !item.lastVerifiedAt || item.lastErrorCategory
                      ? '接続できるか確認する'
                      : item.status !== 'ACTIVE'
                        ? 'この設定を使い始める'
                        : '設定済みです'}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="settings-card">
        <h2>APIキーを準備する手順</h2>
        <ol>
          <li>利用するサービスの公式管理画面でAPIキーを作ります。</li>
          <li>APIキーを下のフォームへ一度だけ貼り付け、予算と変更理由を入力します。</li>
          <li>保存した設定で「接続できるか確認」を押します。</li>
          <li>成功したら「この設定を使い始める」を押します。</li>
        </ol>
        <ul>
          <li>
            OpenAI：<a href="https://platform.openai.com/api-keys">APIキー管理を開く</a>
          </li>
          <li>
            Grok：<a href="https://console.x.ai/">xAI Consoleを開く</a>
          </li>
          <li>
            Exa：<a href="https://dashboard.exa.ai/">Exa Dashboardを開く</a>
          </li>
          <li>
            Firecrawl：<a href="https://www.firecrawl.dev/app/api-keys">APIキー管理を開く</a>
          </li>
        </ul>
        <p>APIキーはチャット、変更理由、メモ欄へ書かないでください。</p>
      </section>

      <section className="settings-card">
        <h2>設定を登録する</h2>
        <p>
          入力後、フォームの一番下にある「設定を保存する」を押してください。保存した設定は、すぐ上の「現在の設定状況」と下の「保存した設定」に表示されます。
        </p>
        <form onSubmit={(event) => void create(event)}>
          <label>
            使うサービス
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as Provider)}
            >
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {provider === 'OPENAI' || provider === 'GROK' ? (
            <label>
              使うAIモデル
              <input
                key={provider}
                name="model"
                defaultValue={provider === 'GROK' ? 'grok-4.6' : 'gpt-5-mini'}
                required
                maxLength={120}
              />
            </label>
          ) : null}
          <label>
            APIキー
            <input name="apiKey" type="password" autoComplete="new-password" minLength={8} />
            <small>
              APIキーを登録しない下書きも保存できますが、接続確認と使用開始はできません。
            </small>
          </label>
          <label>
            1日に使ってよい金額（米ドル）
            <input
              name="dailyBudgetUsd"
              type="number"
              defaultValue="1"
              min="0"
              max="10000"
              step="0.01"
              required
            />
          </label>
          <label>
            1か月に使ってよい金額（米ドル）
            <input
              name="monthlyBudgetUsd"
              type="number"
              defaultValue="5"
              min="0"
              max="100000"
              step="0.01"
              required
            />
          </label>
          <label>
            1回の調査にかかる金額（米ドル）
            <input
              name="requestCostUsd"
              type="number"
              defaultValue="0"
              min="0"
              max="1000"
              step="0.000001"
              required
            />
            <small>サービスの料金表にある1回分の金額です。不明なら0のまま保存できます。</small>
          </label>
          <label>
            変更した理由
            <input
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="例：最初の予算を準備"
            />
          </label>
          <div className="settings-save-action">
            <p id="ai-settings-save-help">
              保存だけではAIを使い始めません。保存後に接続確認を行い、確認済みの設定を使用中にします。
            </p>
            <button
              aria-describedby="ai-settings-save-help"
              className="button button--primary button--full"
              disabled={busy}
              type="submit"
            >
              {busy ? '保存しています…' : '設定を保存する'}
            </button>
            {message ? <p role="status">{message}</p> : null}
          </div>
        </form>
      </section>
      <section className="settings-card">
        <h2>保存した設定</h2>
        <p>
          「接続できるか確認」は外部サービスへ最小の確認リクエストを送り、検索サービスでは少量の利用枠を使う場合があります。
        </p>
        {configurations.length === 0 ? (
          <p>まだ設定はありません。</p>
        ) : (
          <ul>
            {configurations.map((item) => (
              <li key={item.id}>
                <strong>
                  {labels[item.provider]}・第{item.version}版
                </strong>
                <p>
                  状態：
                  {item.status === 'DRAFT'
                    ? '下書き'
                    : item.status === 'ACTIVE'
                      ? '使用中'
                      : item.status === 'DISABLED'
                        ? '停止中'
                        : 'エラー'}
                  ／全体停止：{item.globallyPaused ? '停止中' : '稼働中'}
                </p>
                <p>APIキー：{item.apiKeyConfigured ? (item.apiKeyMask ?? '登録済み') : '未登録'}</p>
                {item.model ? <p>AIモデル：{item.model}</p> : null}
                <p>
                  上限：1日 ${usd(item.dailyBudgetUsdMicros)}／1か月 $
                  {usd(item.monthlyBudgetUsdMicros)}
                </p>
                <p>調査1回の原価：${usd(item.requestCostUsdMicros ?? 0)}</p>
                {item.apiKeyConfigured ? (
                  <button
                    className="button button--primary"
                    disabled={actionConfigurationId !== null}
                    onClick={() => void action(item.id, 'test')}
                  >
                    {actionConfigurationId === item.id ? '確認しています…' : '接続できるか確認'}
                  </button>
                ) : null}
                {item.status !== 'ACTIVE' && item.lastVerifiedAt && !item.lastErrorCategory ? (
                  <button
                    className="button button--primary"
                    disabled={actionConfigurationId !== null}
                    onClick={() => void action(item.id, 'activate')}
                  >
                    この設定を使い始める
                  </button>
                ) : null}
                {item.status === 'ACTIVE' && !item.globallyPaused ? (
                  <button
                    className="button button--danger"
                    disabled={actionConfigurationId !== null}
                    onClick={() => void action(item.id, 'pause')}
                  >
                    緊急停止
                  </button>
                ) : null}
                {actionMessages[item.id] ? (
                  <p className="settings-action-message" role="status">
                    {actionMessages[item.id]}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
