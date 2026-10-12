'use client';
import { useEffect, useRef, useState } from 'react';
import {
  overviewPreviewSchema,
  type OverviewPackage,
  type OverviewPreview,
} from '../../../../../src/services/service-improvement-admin-preview';

const names = { SOCIAL: 'SNS運用支援', TRAINING: 'AI研修' };
export function OverviewSummary({ preview }: { preview: OverviewPreview }) {
  return (
    <div>
      <p>
        {preview.week}〜{preview.endDate}（日本時間）の記録です。件数は範囲表示です。
      </p>
      {preview.sections.map((section) => (
        <section className="settings-card" key={section.key}>
          <h3>{section.title}</h3>
          {section.state === 'WITHHELD' ? (
            <>
              <p>集計を保留しています</p>
              <ul>
                {section.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </>
          ) : (
            <dl className="settings-status-list">
              <div className="settings-status-item">
                <dt>保存済み記録の件数範囲</dt>
                <dd>{section.records}</dd>
              </div>
              <div className="settings-status-item">
                <dt>記録のある人数範囲</dt>
                <dd>{section.subjects}</dd>
              </div>
              {section.metrics.map((metric) => (
                <div className="settings-status-item" key={metric.label}>
                  <dt>{metric.label}</dt>
                  <dd>{metric.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p>記録定義：{section.sourceVersion}</p>
        </section>
      ))}
    </div>
  );
}
export function ServiceOverviewCard({
  endpoint,
  packages,
  weeks,
}: {
  endpoint: string;
  packages: OverviewPackage[];
  weeks: string[];
}) {
  const [kind, setKind] = useState<OverviewPackage>(packages[0]!);
  const [week, setWeek] = useState(weeks[0]!);
  const [preview, setPreview] = useState<OverviewPreview | null>(null);
  const [state, setState] = useState<'IDLE' | 'LOADING' | 'READY' | 'UNAVAILABLE' | 'DENIED'>(
    'IDLE',
  );
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  const clear = () => {
    generation.current++;
    controller.current?.abort();
    setPreview(null);
    setState('IDLE');
  };
  const read = async () => {
    const current = ++generation.current;
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    setPreview(null);
    setState('LOADING');
    const timer = setTimeout(() => abort.abort(), 30_000);
    try {
      const response = await fetch(`${endpoint}?kind=${kind}&week=${week}`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: abort.signal,
      });
      if (current !== generation.current) return;
      if ([401, 403, 404].includes(response.status)) {
        setState('DENIED');
        return;
      }
      if (!response.ok) throw new Error('unavailable');
      const raw: unknown = await response.json();
      if (!raw || typeof raw !== 'object' || Object.keys(raw).length !== 1 || !('data' in raw))
        throw new Error('invalid response');
      const result = overviewPreviewSchema.parse(raw.data);
      if (result.week !== week || result.packageKey !== kind) throw new Error('selection mismatch');
      if (current !== generation.current) return;
      setPreview(result);
      setState('READY');
    } catch {
      if (current === generation.current) setState('UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  };
  return (
    <>
      <section className="settings-card">
        <h2>確認する記録と週</h2>
        <p>
          完了済みの直近12週だけを確認できます。利用者別・任意期間の絞り込みやCSV出力はありません。
        </p>
        <label className="field">
          記録の種類
          <select
            className="field__control"
            value={kind}
            onChange={(event) => {
              clear();
              setKind(event.target.value as OverviewPackage);
            }}
          >
            {packages.map((item) => (
              <option key={item} value={item}>
                {names[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          確認する週（日本時間）
          <select
            className="field__control"
            value={week}
            onChange={(event) => {
              clear();
              setWeek(event.target.value);
            }}
          >
            {weeks.map((item) => (
              <option key={item} value={item}>
                {item}の週
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button button--secondary"
          disabled={state === 'LOADING'}
          onClick={() => {
            void read();
          }}
        >
          集計を確認
        </button>
        <p role="status" aria-live="polite">
          {state === 'LOADING'
            ? '集計を確認しています。'
            : state === 'READY'
              ? '保存済み記録を確認しました。品質や成果の判定ではありません。'
              : state === 'DENIED'
                ? 'この記録を確認する権限を再確認してください。表示を消去しました。'
                : state === 'UNAVAILABLE'
                  ? '集計を取得できませんでした。0件とは判定していません。時間をおいて再確認してください。'
                  : '記録の種類と週を選び、集計を確認してください。'}
        </p>
      </section>
      {preview && <OverviewSummary preview={preview} />}
      <section className="settings-card">
        <h2>この画面で分からないこと</h2>
        <p>
          原本の環境・公開版・全利用者を捕捉できたかは未確認です。AI原価、成功率、離脱率、改善効果は未判定です。
        </p>
        <p>
          採用は実投稿ではありません。評価処理の完了は合格や本人の能力の証明ではありません。回答本文・個人の評価結果は表示しません。
        </p>
        <p>
          記録の現在の状態と保存日時から集計します。過去の状態を完全には復元できず、記録種類ごとに読取時点も異なります。
        </p>
        <p>
          少人数や欠測は非表示です。範囲表示は匿名公開の保証ではありません。個人の特定や外部への転載・共有に使わないでください。
        </p>
        <p>読取操作は監査用ログに記録します。自動修正・本番変更の承認にはなりません。</p>
      </section>
    </>
  );
}
