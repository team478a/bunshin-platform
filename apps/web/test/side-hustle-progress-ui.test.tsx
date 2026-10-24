import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CheckinDecisionSelect,
  CheckinDecisionSubmitButton,
} from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/side-hustle/checkin-controls';

describe('side-hustle check-in controls', () => {
  it('disables advancing when no verified practice is available and shows PR-5b revision', () => {
    const select = renderToStaticMarkup(
      <CheckinDecisionSelect
        value="CONTINUE"
        month3={false}
        canAdvance={false}
        onChange={() => {}}
      />,
    );
    const advance = renderToStaticMarkup(
      <CheckinDecisionSubmitButton
        busy={false}
        decision="ADVANCE"
        canAdvance={false}
        onClick={() => {}}
      />,
    );

    expect(select).toContain('<option disabled="" value="ADVANCE">次の段階へ進む</option>');
    expect(select).toContain('<option value="REVISE">地図を見直す</option>');
    expect(advance).toContain('<button disabled="">決める</button>');
  });
});
