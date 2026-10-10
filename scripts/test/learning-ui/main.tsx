// Local browser harness only. No production route, credentials, DB or Provider.
import { createRoot } from 'react-dom/client';
import { PersonalLearningPilotCard } from '../../../apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-pilot-card';
import { InternalPreparationCard } from '../../../apps/web/app/s/[serviceSlug]/manage/programs/personal-learning-preparation/internal-card';
import { DefinitionReviewCard } from '../../../apps/web/app/s/[serviceSlug]/manage/programs/learning-definition-review/card';
import '../../../apps/web/app/styles.css';

createRoot(document.getElementById('root')!).render(
  new URLSearchParams(window.location.search).has('definition-review') ? (
    <DefinitionReviewCard serviceSlug="synthetic" />
  ) : new URLSearchParams(window.location.search).has('internal-preparation') ? (
    <InternalPreparationCard serviceSlug="synthetic" />
  ) : (
    <PersonalLearningPilotCard serviceSlug="synthetic" enrollmentId="synthetic" />
  ),
);
