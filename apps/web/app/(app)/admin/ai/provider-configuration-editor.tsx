'use client';
import { useState, type FormEvent } from 'react';

type Provider = 'OPENAI' | 'EXA' | 'FIRECRAWL';
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
  globallyPaused: boolean;
  lastVerifiedAt: string | null;
  lastErrorCategory: string | null;
};
const labels: Record<Provider, string> = {
  OPENAI: '文章を作るAI（OpenAI）',
  EXA: '話題を調べる検索（Exa）',
  FIRECRAWL: 'ウェブページを読む検索（Firecrawl）',
};
const usd = (micros: number) => (micros / 1_000_000).toFixed(2);

export function AiProviderConfigurationEditor(props: {
  environment: string;
  initialConfigurations: Configuration[];
}) {
  const [configurations, setConfigurations] = useState(props.initialConfigurations);
  const [provider, setProvider] = useState<Provider>('OPENAI');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/admin/ai-provider-configurations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider,
        reason: form.get('reason'),
        model: provider === 'OPENAI' ? form.get('model') : null,
        dailyBudgetUsd: Number(form.get('dailyBudgetUsd')),
        monthlyBudgetUsd: Number(form.get('monthlyBudgetUsd')),
        apiKey: form.get('apiKey') || null,
      }),
    });
    const result = (await response.json()) as {
      data?: Configuration;
      error?: { message?: string };
    };
    if (!response.ok || !result.data) setMessage(result.error?.message ?? '保存できませんでした。');
    else {
      setConfigurations((current) => [result.data!, ...current]);
      setMessage('停止中の下書きを保存しました。まだ外部サービスには接続しません。');
      event.currentTarget.reset();
    }
    setBusy(false);
  }

  return (
    <>
      <section className="settings-card">
        <h2>新しい設定を準備する</h2>
        <p>APIキーがまだなくても保存できます。新しい設定は必ず停止した状態になります。</p>
        {message ? <p role="status">{message}</p> : null}
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
          {provider === 'OPENAI' ? (
            <label>
              使うAIモデル
              <input name="model" defaultValue="gpt-5-mini" required maxLength={120} />
            </label>
          ) : null}
          <label>
            APIキー（まだない場合は空欄）
            <input name="apiKey" type="password" autoComplete="new-password" minLength={8} />
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
            変更した理由
            <input
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="例：最初の予算を準備"
            />
          </label>
          <button disabled={busy} type="submit">
            停止中の下書きを保存
          </button>
        </form>
      </section>
      <section className="settings-card">
        <h2>保存した設定</h2>
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
