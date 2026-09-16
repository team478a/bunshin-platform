'use client';

import { FORTUNE_ORIENTATIONS, FORTUNE_THEMES, TAROT_DECK } from '@bunshin/capability-fortune';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

async function send(serviceSlug: string, value: unknown) {
  const response = await fetch(`/api/services/${serviceSlug}/fortune-operations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
  const body = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? '操作を完了できませんでした。');
}

export function FortuneOperatorEditor({
  serviceSlug,
  configured,
  standardKnowledgeReady,
  enabled,
  aiEnabled,
  weeklyNotificationEnabled,
  weeklyNotificationDay,
  weeklyNotificationHour,
  timeZone,
  canEnable,
  bunshinId,
  bunshins,
}: {
  serviceSlug: string;
  configured: boolean;
  standardKnowledgeReady: boolean;
  enabled: boolean;
  aiEnabled: boolean;
  weeklyNotificationEnabled: boolean;
  weeklyNotificationDay: number;
  weeklyNotificationHour: number;
  timeZone: string;
  canEnable: boolean;
  bunshinId: string | null;
  bunshins: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [selectedBunshinId, setSelectedBunshinId] = useState(bunshinId ?? bunshins[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notificationDay, setNotificationDay] = useState(weeklyNotificationDay);
  const [notificationHour, setNotificationHour] = useState(weeklyNotificationHour);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedBunshinId && bunshinId) setSelectedBunshinId(bunshinId);
  }, [bunshinId, selectedBunshinId]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作を完了できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const meanings = TAROT_DECK.flatMap((card) =>
      FORTUNE_ORIENTATIONS.flatMap((orientation) =>
        FORTUNE_THEMES.map((theme) => ({
          cardCode: card.code,
          orientation,
          theme,
          title: '',
          body: '',
          actionStep: '',
        })),
      ),
    );
    const blob = new Blob(
      [JSON.stringify({ promptVersion: 'fortune-basic-v1', meanings }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'fortune-knowledge-template.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fortune-operator-editor">
      {!configured && (
        <section className="settings-card">
          <h2>最初に、占いパッケージを準備する</h2>
          <p>
            青いボタンを1回押すと、占い担当と安全確認済みの標準解釈468件をまとめて準備します。
            この操作だけでは利用者へ公開されません。
          </p>
          <button
            className="button button--primary"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await send(serviceSlug, { action: 'INSTALL_STANDARD_PACKAGE' });
                setMessage('占いパッケージを準備しました。公開前の確認へ進んでください。');
              })
            }
          >
            {busy ? '準備しています…' : '占いパッケージを準備する'}
          </button>
        </section>
      )}
      {configured && (
        <>
          <section className="settings-card">
            <h2>1. 担当を選ぶ</h2>
            {bunshins.length === 0 ? (
              <p className="form-error">
                このサービスには利用できる投稿パートナーがいません。先に投稿パートナーを作成してください。
              </p>
            ) : (
              <>
                <label>
                  占いを担当する投稿パートナー
                  <select
                    value={selectedBunshinId}
                    onChange={(event) => setSelectedBunshinId(event.target.value)}
                    disabled={busy}
                  >
                    {bunshins.map((bunshin) => (
                      <option key={bunshin.id} value={bunshin.id}>
                        {bunshin.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </section>
          <section className="settings-card">
            <h2>2. 標準解釈を確認して導入する</h2>
            <p>
              カードごとの象徴を、恋愛・仕事・人間関係の3テーマに合わせた初期運用向けの468件です。
              断定、診断、投資判断、販売誘導を含まないよう検査されています。
            </p>
            {standardKnowledgeReady && (
              <p className="success-message">安全確認済みの標準解釈468件は導入済みです。</p>
            )}
            <div className="button-row">
              <a
                className="button button--secondary"
                href={`/api/services/${serviceSlug}/fortune-operations?download=standard`}
              >
                全468件を保存して確認する
              </a>
              <button
                className="button button--primary"
                type="button"
                disabled={busy || !selectedBunshinId || standardKnowledgeReady}
                onClick={() =>
                  void run(async () => {
                    await send(serviceSlug, {
                      action: 'IMPORT_STANDARD_KNOWLEDGE',
                      bunshinId: selectedBunshinId,
                    });
                    setMessage('標準解釈468件を承認版として保存しました。');
                  })
                }
              >
                {busy ? '保存しています…' : '内容を承認して標準解釈を導入する'}
              </button>
            </div>
          </section>
          <section className="settings-card">
            <h2>3. 独自の解釈を使う場合</h2>
            <p>
              標準解釈を使わず、独自の文章へ差し替える場合だけ利用します。ひな形には468件すべてが入っています。
            </p>
            <button className="button button--secondary" type="button" onClick={downloadTemplate}>
              空のJSONひな形を保存する
            </button>
            {bunshins.length > 0 && (
              <>
                <label>
                  完成したJSONファイル
                  <input
                    type="file"
                    accept="application/json,.json"
                    disabled={busy}
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  className="button button--primary"
                  type="button"
                  disabled={busy || !file || !selectedBunshinId}
                  onClick={() =>
                    void run(async () => {
                      if (!file) return;
                      const pack = JSON.parse(await file.text()) as unknown;
                      await send(serviceSlug, {
                        action: 'IMPORT_KNOWLEDGE',
                        bunshinId: selectedBunshinId,
                        pack,
                      });
                      setMessage('468件を検査し、承認版として保存しました。');
                    })
                  }
                >
                  {busy ? '検査しています…' : '検査して承認版を保存する'}
                </button>
              </>
            )}
          </section>
          <section className="settings-card">
            <h2>4. 利用者への公開</h2>
            <p>{enabled ? '現在、占い機能は公開中です。' : '現在、占い機能は停止中です。'}</p>
            <button
              className={`button ${enabled ? 'button--secondary' : 'button--primary'}`}
              type="button"
              disabled={busy || (!enabled && !canEnable)}
              onClick={() =>
                void run(async () => {
                  await send(serviceSlug, { action: 'SET_ENABLED', enabled: !enabled });
                  setMessage(enabled ? '占い機能を停止しました。' : '占い機能を公開しました。');
                })
              }
            >
              {enabled ? '利用者への公開を停止する' : '準備完了後に公開する'}
            </button>
          </section>
          <section className="settings-card">
            <h2>5. AIで文章を個別化する</h2>
            <p>
              有効にすると、承認済み標準解釈を土台に、その日のカード・正逆・テーマに合わせて文章を整えます。
              AIが利用できない場合や安全検査に通らない場合は、標準解釈をそのまま表示します。
            </p>
            <p>{aiEnabled ? '現在、AI個別化は有効です。' : '現在、標準解釈だけを表示します。'}</p>
            <button
              className={`button ${aiEnabled ? 'button--secondary' : 'button--primary'}`}
              type="button"
              disabled={busy || (!aiEnabled && !enabled)}
              onClick={() =>
                void run(async () => {
                  await send(serviceSlug, { action: 'SET_AI_ENABLED', enabled: !aiEnabled });
                  setMessage(aiEnabled ? 'AI個別化を停止しました。' : 'AI個別化を有効にしました。');
                })
              }
            >
              {aiEnabled ? 'AI個別化を停止する' : 'AI接続を確認して有効にする'}
            </button>
          </section>
          <section className="settings-card">
            <h2>6. 週1回のお知らせ</h2>
            <p>
              希望した利用者だけに、占いを確認できる案内をLINEで送ります。占い結果や個人情報はLINE本文に載せません。
            </p>
            <label>
              曜日
              <select
                value={notificationDay}
                disabled={busy}
                onChange={(event) => setNotificationDay(Number(event.target.value))}
              >
                {['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'].map(
                  (label, value) => (
                    <option key={label} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              配信時刻（{timeZone}）
              <select
                value={notificationHour}
                disabled={busy}
                onChange={(event) => setNotificationHour(Number(event.target.value))}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {hour}時
                  </option>
                ))}
              </select>
            </label>
            <p>
              {weeklyNotificationEnabled
                ? '現在、本人が希望した場合だけ配信します。'
                : '現在、週次LINE通知は停止中です。'}
            </p>
            <button
              className={`button ${weeklyNotificationEnabled ? 'button--secondary' : 'button--primary'}`}
              type="button"
              disabled={busy || (!weeklyNotificationEnabled && !enabled)}
              onClick={() =>
                void run(async () => {
                  await send(serviceSlug, {
                    action: 'SET_WEEKLY_NOTIFICATION',
                    enabled: !weeklyNotificationEnabled,
                    weekday: notificationDay,
                    hour: notificationHour,
                  });
                  setMessage(
                    weeklyNotificationEnabled
                      ? '週次LINE通知を停止しました。'
                      : '週次LINE通知を有効にしました。利用者本人の希望後に配信されます。',
                  );
                })
              }
            >
              {weeklyNotificationEnabled ? '週次LINE通知を停止する' : 'この曜日と時刻で有効にする'}
            </button>
            {weeklyNotificationEnabled && (
              <button
                className="button button--secondary"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await send(serviceSlug, {
                      action: 'SET_WEEKLY_NOTIFICATION',
                      enabled: true,
                      weekday: notificationDay,
                      hour: notificationHour,
                    });
                    setMessage('配信する曜日と時刻を変更しました。');
                  })
                }
              >
                曜日と時刻を変更する
              </button>
            )}
          </section>
        </>
      )}
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
