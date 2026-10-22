import type { ChangeEvent } from 'react';

export function CheckinDecisionSelect({
  value,
  month3,
  canAdvance,
  onChange,
}: {
  value: string;
  month3: boolean;
  canAdvance: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
    >
      <option disabled={!canAdvance} value="ADVANCE">
        {month3 ? '90日の地図を終える' : '次の段階へ進む'}
      </option>
      <option value="CONTINUE">いまの段階を続ける</option>
      <option value="RESELECT">別の副業を選び直す</option>
    </select>
  );
}

export function CheckinDecisionSubmitButton({
  busy,
  decision,
  canAdvance,
  onClick,
}: {
  busy: boolean;
  decision: string;
  canAdvance: boolean;
  onClick: () => void;
}) {
  return (
    <button disabled={busy || (decision === 'ADVANCE' && !canAdvance)} onClick={onClick}>
      決める
    </button>
  );
}
