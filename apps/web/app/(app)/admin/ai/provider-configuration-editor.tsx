'use client';
import { useState, type FormEvent } from 'react';

type Provider = 'OPENAI' | 'GROK' | 'EXA' | 'FIRECRAWL' | 'CREATOMATE';
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
  CREATOMATE: '動画を仕上げるサービス（Creatomate）',
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

  async function startUsing(id: string) {
    setActionConfigurationId(id);
    setMessage('');
    setActionMessages((current) => ({
      ...current,
      [id]: '安全に接続できるか確認して、使用を始めています…',
    }));
    try {
      const testResponse = await fetch(`/api/admin/ai-provider-configurations/${id}/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const testResult = (await testResponse.json()) as {
        data?: { success: boolean; errorCategory: string | null };
        error?: { message?: string };
      };
      if (!testResponse.ok || !testResult.data) {
        setActionMessages((current) => ({
          ...current,
          [id]: testResult.error?.message ?? '接続できませんでした。',
        }));
        return;
      }
      if (!testResult.data.success) {
        setConfigurations((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  lastVerifiedAt: new Date().toISOString(),
                  lastErrorCategory: testResult.data?.errorCategory ?? 'PROVIDER_UNAVAILABLE',
                }
              : item,
          ),
        );
        setActionMessages((current) => ({
          ...current,
          [id]: `使用を開始できませんでした：${connectionErrors[testResult.data?.errorCategory ?? ''] ?? '原因を確認できませんでした'}`,
        }));
        return;
      }

      const activateResponse = await fetch(`/api/admin/ai-provider-configurations/${id}/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: '管理画面から接続確認後に使用開始' }),
      });
      const activateResult = (await activateResponse.json()) as {
        data?: Configuration;
        error?: { message?: string };
      };
      if (!activateResponse.ok || !activateResult.data) {
        setActionMessages((current) => ({
          ...current,
          [id]: activateResult.error?.message ?? '使用を開始できませんでした。',
        }));
        return;
      }
      const updated = activateResult.data;
      setConfigurations((current) =>
        current.map((item) =>
          item.id === updated.id
            ? updated
            : item.provider === updated.provider && item.status === 'ACTIVE'
              ? { ...item, status: 'DISABLED', globallyPaused: true }
              : item,
        ),
      );
      setActionMessages((current) => ({ ...current, [id]: '使用中になりました。' }));
    } catch {
      setActionMessages((current) => ({
        ...current,
        [id]: '通信に失敗しました。画面を再読み込みして、もう一度お試しください。',
      }));
    } finally {
      setActionConfigurationId(null);
    }
  }

  async function pause(id: string) {
    const reason = window.prompt('停止する理由を入力してください。');
    if (!reason) return;
    setActionConfigurationId(id);
    setActionMessages((current) => ({ ...current, [id]: '停止しています…' }));
    try {
      const response = await fetch(`/api/admin/ai-provider-configurations/${id}/pause`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const result = (await response.json()) as {
        data?: Configuration;
        error?: { message?: string };
      };
      if (!response.ok || !result.data) {
        setActionMessages((current) => ({
          ...current,
          [id]: result.error?.message ?? '停止できませんでした。',
        }));
        return;
      }
      const updated = result.data;
      setConfigurations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setActionMessages((current) => ({ ...current, [id]: '停止しました。' }));
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
                    : item.status !== 'ACTIVE'
                      ? 'この設定を使い始める'
                      : '設定済みです'}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {configurations.some((item) => item.apiKeyConfigured) ? null : (
        <section className="settings-card">
          <h2>初めてAIを設定する手順</h2>
          <ol>
            <li>利用するサービスの公式管理画面でAPIキーを作ります。</li>
            <li>APIキーを下のフォームへ一度だけ貼り付け、予算と変更理由を入力します。</li>
            <li>保存した設定で「この設定を使い始める」を押します。</li>
            <li>接続確認は自動で行われ、成功した場合だけ使用中になります。</li>
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
            <li>
              Creatomate：<a href="https://creatomate.com/dashboard">管理画面を開く</a>
            </li>
          </ul>
          <p>APIキーはチャット、変更理由、メモ欄へ書かないでください。</p>
        </section>
      )}

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
            1回の利用にかかる金額（米ドル）
            <input
              name="requestCostUsd"
              type="number"
              defaultValue="0"
              min="0"
              max="1000"
              step="0.000001"
              required
            />
            <small>調査または動画1本にかかる見込み金額です。不明なら0のまま保存できます。</small>
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
          「この設定を使い始める」を押すと、安全に接続できるか自動確認します。検索サービスでは少量の利用枠を使う場合があります。Creatomateは動画を作らず接続だけ確認します。
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
                <p>利用1回の見込み原価：${usd(item.requestCostUsdMicros ?? 0)}</p>
                {item.apiKeyConfigured && item.status !== 'ACTIVE' ? (
                  <button
                    className="button button--primary"
                    disabled={actionConfigurationId !== null}
                    onClick={() => void startUsing(item.id)}
                  >
                    {actionConfigurationId === item.id
                      ? '使用を始めています…'
                      : 'この設定を使い始める'}
                  </button>
                ) : null}
                {item.status === 'ACTIVE' && !item.globallyPaused ? (
                  <button
                    className="button button--danger"
                    disabled={actionConfigurationId !== null}
                    onClick={() => void pause(item.id)}
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
