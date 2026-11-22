import type { Prisma } from '@bunshin/database';
import {
  experimentEvaluations,
  readFortuneExperimentEvidence,
} from '../../../../../../src/fortune/experiments';

const numericFields = [
  ['priceYen', '販売価格（円）'],
  ['advertisingYen', '広告費（円）'],
  ['purchases', '購入件数'],
  ['salesYen', '売上（円）'],
  ['costsYen', '原価（円）'],
  ['profitYen', '利益（円）'],
] as const;
const noteFields = [
  ['changes', '実施した改善と手順', 2000],
  ['observed', '改善前後の結果・比較条件', 2000],
  ['next', '次に検証する仮説', 1000],
] as const;

export function FortuneExperimentForm({
  action,
  experiment,
}: {
  action: (form: FormData) => Promise<void>;
  experiment?: Prisma.FortuneSalesExperimentGetPayload<undefined>;
}) {
  const evidence = experiment ? readFortuneExperimentEvidence(experiment.evidence) : undefined;
  return (
    <form action={action} className="app-form">
      <input type="hidden" name="kind" value="experiment" />
      {experiment && <input type="hidden" name="id" value={experiment.id} />}
      <label className="form-field">
        実証タイトル
        <input name="title" maxLength={160} defaultValue={experiment?.title} required />
      </label>
      <label className="form-field">
        対象商品
        <input
          name="productLabel"
          maxLength={120}
          defaultValue={experiment?.productLabel}
          required
        />
      </label>
      <label className="form-field">
        開始日
        <input
          name="startsOn"
          type="date"
          defaultValue={experiment?.startsOn.toISOString().slice(0, 10)}
          required
        />
      </label>
      <label className="form-field">
        終了日
        <input
          name="endsOn"
          type="date"
          defaultValue={experiment?.endsOn.toISOString().slice(0, 10)}
          required
        />
      </label>
      <label className="form-field">
        集客チャネル
        <input name="channel" maxLength={64} defaultValue={experiment?.channel} required />
      </label>
      <label className="form-field">
        LP・広告のバージョン
        <input name="lpVersion" maxLength={120} defaultValue={evidence?.lpVersion} />
      </label>
      {numericFields.map(([key, label]) => (
        <label className="form-field" key={key}>
          {label}
          <input
            type="number"
            name={key}
            min={key === 'profitYen' ? -1_000_000_000 : 0}
            max={1_000_000_000}
            defaultValue={evidence?.[key]}
          />
        </label>
      ))}
      {noteFields.map(([key, label, maxLength]) => (
        <label className="form-field" key={key}>
          {label}
          <textarea name={key} maxLength={maxLength} defaultValue={evidence?.[key]} />
        </label>
      ))}
      <label className="form-field">
        評価
        <select name="evaluation" defaultValue={evidence?.evaluation ?? 'PLANNED'}>
          {Object.entries(experimentEvaluations).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button className="button button--primary" type="submit">
        実証記録を保存
      </button>
    </form>
  );
}
