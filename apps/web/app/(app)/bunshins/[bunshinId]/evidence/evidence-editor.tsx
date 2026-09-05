'use client';

import { useState, type FormEvent } from 'react';
import { parseOfficialClaims } from './view-model';

type Evidence = { id: string; type: string; title: string; claim: string; status: string };
type Review = {
  id: string;
  classification: string;
  verdict: string;
  issueCodes: string[];
  reviewedAt: string;
};
const issueLabels: Record<string, string> = {
  PRODUCT_PACK_REQUIRED: '使用できる商品情報がありません',
  PERSONAL_EVIDENCE_REQUIRED: '本人の経験を確認できる根拠が必要です',
  UNKNOWN_OFFICIAL_FACT: '商品情報にない事実が含まれています',
  OFFICIAL_FACT_MISMATCH: '商品情報と内容が一致しません',
  FORBIDDEN_EXPRESSION: '使ってはいけない表現が含まれています',
  CONDITIONAL_DISCLOSURE_MISSING: '条件に応じた注意書きが不足しています',
  REQUIRED_DISCLOSURE_MISSING: '必要な表示が不足しています',
};
const issueLabel = (code: string) => issueLabels[code] ?? '確認できない項目があります';
const text = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};

async function post(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body === undefined
      ? { method: 'POST' }
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const result = (await response.json()) as { data?: unknown; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message ?? '処理できませんでした。');
  return result.data;
}

export function EvidenceEditor({
  workspaceId,
  bunshinId,
  initialEvidence,
  initialReviews,
  assignment,
}: {
  workspaceId: string;
  bunshinId: string;
  initialEvidence: unknown[];
  initialReviews: unknown[];
  assignment: { versionId: string; label: string } | null;
}) {
  const base = `/api/workspaces/${workspaceId}/bunshins/${bunshinId}`;
  const [evidence, setEvidence] = useState(initialEvidence as Evidence[]);
  const [reviews, setReviews] = useState(initialReviews as Review[]);
  const [message, setMessage] = useState('');
  const reload = async () => {
    const [evidenceResponse, reviewResponse] = await Promise.all([
      fetch(`${base}/evidence`, { cache: 'no-store' }),
      fetch(`${base}/advertising-safety-reviews`, { cache: 'no-store' }),
    ]);
    setEvidence(((await evidenceResponse.json()) as { data: Evidence[] }).data);
    setReviews(((await reviewResponse.json()) as { data: Review[] }).data);
  };
  const run = async (operation: () => Promise<unknown>) => {
    setMessage('確認しています…');
    try {
      await operation();
      await reload();
      setMessage('保存しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '処理できませんでした。');
    }
  };
  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(() =>
      post(`${base}/evidence`, {
        type: text(data, 'type'),
        title: text(data, 'title'),
        claim: text(data, 'claim'),
        sourceUrl: text(data, 'sourceUrl') || null,
        occurredAt: null,
      }),
    );
  };
  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const classification = text(data, 'classification');
    void run(() =>
      post(`${base}/advertising-safety-reviews`, {
        productPackVersionId: classification === 'ORGANIC' ? null : (assignment?.versionId ?? null),
        classification,
        evidenceRequirement: data.get('personalEvidence') === 'on' ? 'PERSONAL_EVIDENCE' : 'NONE',
        evidenceIds: data
          .getAll('evidenceIds')
          .filter((value): value is string => typeof value === 'string'),
        officialClaims: parseOfficialClaims(text(data, 'officialClaims')),
        content: text(data, 'content'),
      }),
    );
  };
  return (
    <div className="evidence-editor">
      <section className="settings-card evidence-card">
        <header className="evidence-card__header">
          <span className="evidence-card__step">1</span>
          <div>
            <h2>経験の根拠を登録する</h2>
            <p>資格、利用経験、実際の結果など、本人について確認できる事実だけを登録します。</p>
          </div>
        </header>
        <form className="evidence-form" onSubmit={create}>
          <label className="field">
            <span className="field__label">種類</span>
            <select className="field__control" name="type">
              <option value="USAGE">使った経験</option>
              <option value="EXPERIENCE">体験</option>
              <option value="RESULT">結果</option>
              <option value="QUALIFICATION">資格</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">短い名前</span>
            <input
              className="field__control"
              name="title"
              required
              maxLength={160}
              placeholder="例：3か月使った感想"
            />
          </label>
          <label className="field evidence-form__wide">
            <span className="field__label">確認できる内容</span>
            <textarea
              className="field__control"
              name="claim"
              required
              maxLength={1000}
              rows={4}
              placeholder="例：2026年4月から毎日利用し、○○を続けられた"
            />
          </label>
          <label className="field evidence-form__wide">
            <span className="field__label">確認先URL（任意・httpsのみ）</span>
            <input className="field__control" name="sourceUrl" type="url" placeholder="https://" />
          </label>
          <button className="button evidence-form__submit" type="submit">
            根拠を登録する
          </button>
        </form>
        <div className="evidence-list-heading">
          <h3>登録した根拠</h3>
          <span>{evidence.length}件</span>
        </div>
        <ul className="evidence-list">
          {evidence.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.claim}</p>
              </div>
              <span className={`evidence-status evidence-status--${item.status.toLowerCase()}`}>
                {item.status === 'ACTIVE' ? '使用できます' : '使用停止'}
              </span>
              {item.status === 'ACTIVE' ? (
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => void run(() => post(`${base}/evidence/${item.id}/revoke`))}
                >
                  使用をやめる
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="settings-card evidence-card">
        <header className="evidence-card__header">
          <span className="evidence-card__step">2</span>
          <div>
            <h2>投稿文を安全確認する</h2>
            <p>投稿文は保存せず、確認結果と文章の照合用番号だけを保存します。</p>
          </div>
        </header>
        <p className="evidence-product">
          <span>使用中の商品</span>
          <strong>{assignment?.label ?? '商品は設定されていません'}</strong>
        </p>
        <form className="evidence-form" onSubmit={review}>
          <label className="field">
            <span className="field__label">投稿の種類</span>
            <select className="field__control" name="classification">
              <option value="ORGANIC">ふつうの投稿</option>
              <option value="PRODUCT_RELATED">商品に関係する投稿</option>
              <option value="ADVERTISEMENT">広告・PR投稿</option>
            </select>
          </label>
          <label className="evidence-checkbox evidence-form__wide">
            <input type="checkbox" name="personalEvidence" />
            <span>「自分が使った・結果が出た」など、本人の経験を書いている</span>
          </label>
          <fieldset className="evidence-fieldset evidence-form__wide">
            <legend>使う根拠を選ぶ</legend>
            <p>投稿文に書く経験だけを選んでください。</p>
            {evidence
              .filter((item) => item.status === 'ACTIVE')
              .map((item) => (
                <label className="evidence-checkbox" key={item.id}>
                  <input type="checkbox" name="evidenceIds" value={item.id} />
                  <span>{item.title}</span>
                </label>
              ))}
          </fieldset>
          <label className="field evidence-form__wide">
            <span className="field__label">文章に書いた公式事実（任意）</span>
            <span className="field__hint">1行に「項目=内容」で入力します。</span>
            <textarea
              className="field__control"
              name="officialClaims"
              rows={3}
              placeholder="価格=月額1,000円"
            />
          </label>
          <label className="field evidence-form__wide">
            <span className="field__label">確認する投稿文</span>
            <textarea
              className="field__control"
              name="content"
              required
              maxLength={20000}
              rows={8}
              placeholder="ここに投稿する文章を貼り付けてください"
            />
          </label>
          <button className="button evidence-form__submit" type="submit">
            投稿文を確認する
          </button>
        </form>
        <div className="evidence-list-heading">
          <h3>最近の確認結果</h3>
          <span>{reviews.length}件</span>
        </div>
        <ul className="evidence-review-list">
          {reviews.map((item) => (
            <li className={item.verdict === 'PASS' ? 'is-pass' : 'is-warning'} key={item.id}>
              <strong>{item.verdict === 'PASS' ? '使用できます' : '修正が必要です'}</strong>
              <span>
                {item.verdict === 'PASS'
                  ? 'このまま投稿できます。'
                  : item.issueCodes.map(issueLabel).join('、')}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <p className="evidence-message" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
