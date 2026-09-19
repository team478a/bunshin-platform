'use client';

import { useState, type FormEvent } from 'react';

type SupportMode = 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE';
const labels: Record<SupportMode, string> = {
  IDEA_ONLY: '企画だけ',
  GUIDED: '作り方・台本・プロンプト',
  READY_TO_USE: 'そのまま使える完成品',
};

type Program = {
  id: string;
  name: string;
  description: string;
  supportModes: SupportMode[];
  product: {
    offeringId: string;
    amountYen: number;
    durationDays: number;
    supportMode: SupportMode;
  } | null;
};

export function ProgramProductAdmin({
  serviceSlug,
  paymentEnabled,
  legalReady,
  programs,
}: {
  serviceSlug: string;
  paymentEnabled: boolean;
  legalReady: boolean;
  programs: Program[];
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function save(event: FormEvent<HTMLFormElement>, program: Program) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => {
      const field = data.get(name);
      return typeof field === 'string' ? field : '';
    };
    setSaving(true);
    setMessage('商品を保存しています…');
    try {
      const response = await fetch(`/api/services/${serviceSlug}/program-products`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceProgramId: program.id,
          amountYen: Number(value('amountYen')),
          durationDays: Number(value('durationDays')),
          supportMode: value('supportMode'),
        }),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? '商品を保存できませんでした。');
      setMessage('有料商品を公開しました。画面を更新します…');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '商品を保存できませんでした。');
      setSaving(false);
    }
  }

  async function disable(offeringId: string) {
    setSaving(true);
    setMessage('販売を停止しています…');
    try {
      const response = await fetch(`/api/services/${serviceSlug}/program-products/${offeringId}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? '販売を停止できませんでした。');
      setMessage('新規販売を停止しました。購入済みの利用権は継続します。');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '販売を停止できませんでした。');
      setSaving(false);
    }
  }

  return (
    <section className="settings-card program-management-card">
      <p className="eyebrow">3. 有料で提供する</p>
      <h2>プログラムの商品設定</h2>
      <p>
        価格と利用期間を設定すると、参加者がStripeで購入できます。公開済み条件を変更した場合も、購入済みの条件は変わりません。
      </p>
      {!paymentEnabled ? (
        <p className="notice notice--warning">
          運営団体のStripe接続が有効になるまで、参加者には購入ボタンを表示しません。
        </p>
      ) : null}
      {!legalReady ? (
        <p className="notice notice--warning">
          販売前に、<a href={`/s/${serviceSlug}/manage/legal`}>法務文書の設定</a>から利用規約、
          プライバシーポリシー、特定商取引法に基づく表示を公開してください。
        </p>
      ) : null}
      {programs.length === 0 ? <p>商品にできるプログラムはありません。</p> : null}
      <p role="status" aria-live="polite">
        {message}
      </p>
      <div className="settings-stack program-management-card__list">
        {programs.map((program) => (
          <article key={program.id}>
            <h3>{program.name}</h3>
            <p>{program.description}</p>
            {program.product ? (
              <p>
                公開中：{program.product.amountYen.toLocaleString('ja-JP')}円／
                {program.product.durationDays}日間
              </p>
            ) : (
              <p>現在は無料提供です。有料商品を公開すると、新規参加者は購入して参加します。</p>
            )}
            <form className="form-stack" onSubmit={(event) => void save(event, program)}>
              <label className="field">
                <span className="field__label">販売価格（税込・円）</span>
                <input
                  className="field__control"
                  name="amountYen"
                  type="number"
                  min="1"
                  max="10000000"
                  defaultValue={program.product?.amountYen ?? 9800}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">利用できる日数</span>
                <input
                  className="field__control"
                  name="durationDays"
                  type="number"
                  min="1"
                  max="3650"
                  defaultValue={program.product?.durationDays ?? 90}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">提供する内容</span>
                <select
                  className="field__control"
                  name="supportMode"
                  defaultValue={program.product?.supportMode ?? program.supportModes[0]}
                  required
                >
                  {program.supportModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {labels[mode]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button button--primary" disabled={saving || !legalReady}>
                {program.product ? '新しい条件で更新する' : '有料商品として公開する'}
              </button>
              {program.product ? (
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    if (program.product) void disable(program.product.offeringId);
                  }}
                >
                  新規販売を停止する
                </button>
              ) : null}
            </form>
          </article>
        ))}
      </div>
    </section>
  );
}
