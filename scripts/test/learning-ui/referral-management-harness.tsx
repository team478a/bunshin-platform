import { ReferralManagementEditor } from '../../../apps/web/app/s/[serviceSlug]/manage/referrals/referral-management-editor';
import { referralFixture } from './referral-fixture';
export function ReferralManagementHarness() {
  const initial = referralFixture();
  if (new URLSearchParams(location.search).has('oem')) {
    initial.canSetHeadquartersPolicy = false;
    initial.headquartersPolicy = null;
    initial.policy = null;
  }
  return (
    <main className="app-page">
      <h1>紹介の審査・確定</h1>
      <ReferralManagementEditor serviceSlug="synthetic" initial={initial} />
    </main>
  );
}
