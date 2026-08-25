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
    <>
      <section className="settings-card">
        <h2>経験の根拠を登録する</h2>
        <p>資格、利用経験、実際の結果など、本人について確認できる事実だけを登録してください。</p>
        <form onSubmit={create}>
          <label>
            種類
            <select name="type">
              <option value="USAGE">使った経験</option>
              <option value="EXPERIENCE">体験</option>
              <option value="RESULT">結果</option>
              <option value="QUALIFICATION">資格</option>
            </select>
          </label>
          <label>
            短い名前
            <input name="title" required maxLength={160} />
          </label>
          <label>
            確認できる内容
            <textarea name="claim" required maxLength={1000} />
          </label>
          <label>
            確認先URL（任意・httpsのみ）
            <input name="sourceUrl" type="url" />
          </label>
          <button type="submit">登録する</button>
        </form>
        <ul>
          {evidence.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>：{item.claim}（
              {item.status === 'ACTIVE' ? '使用できます' : '使用停止'}）
              {item.status === 'ACTIVE' ? (
                <button
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
      <section className="settings-card">
        <h2>投稿文を安全確認する</h2>
        <p>文章そのものは保存せず、確認結果と文章の照合用番号だけを保存します。</p>
        <p>使用中の商品：{assignment?.label ?? 'ありません'}</p>
        <form onSubmit={review}>
          <label>
            投稿の種類
            <select name="classification">
              <option value="ORGANIC">ふつうの投稿</option>
              <option value="PRODUCT_RELATED">商品に関係する投稿</option>
              <option value="ADVERTISEMENT">広告・PR投稿</option>
            </select>
          </label>
          <label>
            <input type="checkbox" name="personalEvidence" />
            「自分が使った・結果が出た」など本人の経験を含む
          </label>
          <fieldset>
            <legend>使う根拠</legend>
            {evidence
              .filter((item) => item.status === 'ACTIVE')
              .map((item) => (
                <label key={item.id}>
                  <input type="checkbox" name="evidenceIds" value={item.id} />
                  {item.title}
                </label>
              ))}
          </fieldset>
          <label>
            文章に書いた公式事実（任意・1行に「項目=内容」）
            <textarea name="officialClaims" placeholder="価格=月額1,000円" />
          </label>
          <label>
            確認する投稿文
            <textarea name="content" required maxLength={20000} />
          </label>
          <button type="submit">安全を確認する</button>
        </form>
        <h3>最近の確認結果</h3>
        <ul>
          {reviews.map((item) => (
            <li key={item.id}>
              {item.verdict === 'PASS'
                ? '使用できます'
                : `修正が必要：${item.issueCodes.map(issueLabel).join('、')}`}
            </li>
          ))}
        </ul>
      </section>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </>
  );
}
