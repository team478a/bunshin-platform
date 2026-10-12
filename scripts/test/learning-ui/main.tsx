// Local browser harness only. No production route, credentials, DB or Provider.
import { createRoot } from 'react-dom/client';
import { PersonalLearningPilotCard } from '../../../apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-pilot-card';
import { InternalPreparationCard } from '../../../apps/web/app/s/[serviceSlug]/manage/programs/personal-learning-preparation/internal-card';
import { DefinitionReviewCard } from '../../../apps/web/app/s/[serviceSlug]/manage/programs/learning-definition-review/card';
import { ServiceOverviewCard } from '../../../apps/web/app/s/[serviceSlug]/manage/improvement-overview/card';
import { AiTrainingCard } from '../../../apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-card';
import '../../../apps/web/app/styles.css';

createRoot(document.getElementById('root')!).render(
  new URLSearchParams(window.location.search).has('training-setup') ? (
    <AiTrainingCard
      serviceSlug="synthetic"
      initialState={{
        enrollmentId: 'synthetic',
        programName: '合成研修',
        enrollmentStatus: 'ACTIVE',
        startsAt: '2026-10-12T00:00:00Z',
        endsAt: null,
        profile: null,
        goal: null,
        action: null,
      }}
    />
  ) : new URLSearchParams(window.location.search).has('improvement-overview') ? (
    <ServiceOverviewCard
      endpoint="/api/services/synthetic/improvement-overview"
      packages={['SOCIAL', 'TRAINING']}
      weeks={['2026-10-05', '2026-09-28']}
    />
  ) : new URLSearchParams(window.location.search).has('definition-review') ? (
    <DefinitionReviewCard serviceSlug="synthetic" />
  ) : new URLSearchParams(window.location.search).has('internal-preparation') ? (
    <InternalPreparationCard serviceSlug="synthetic" />
  ) : (
    <PersonalLearningPilotCard serviceSlug="synthetic" enrollmentId="synthetic" />
  ),
);
