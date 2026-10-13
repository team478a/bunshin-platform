// Local browser harness only. No production route, credentials, DB or Provider.
import { createRoot } from 'react-dom/client';
import { LearningCandidateCard } from '../../../apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/candidate-card';
import { lessonWish, lessonCandidate } from './lesson-fixture';
import {
  practiceFixture,
  supportedPracticeFixture,
  verifiedPracticeFixture,
} from './practice-fixture';
import { PersonalLearningPilotCard } from '../../../apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-pilot-card';
import { InternalPreparationCard } from '../../../apps/web/app/s/[serviceSlug]/manage/programs/personal-learning-preparation/internal-card';
import { DefinitionReviewCard } from '../../../apps/web/app/s/[serviceSlug]/manage/programs/learning-definition-review/card';
import { ServiceOverviewCard } from '../../../apps/web/app/s/[serviceSlug]/manage/improvement-overview/card';
import { AiTrainingCard } from '../../../apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-card';
import '../../../apps/web/app/styles.css';
import { PersonalLearningRequestCard } from '../../../apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/card';

createRoot(document.getElementById('root')!).render(
  new URLSearchParams(window.location.search).has('practice') ? (
    <PersonalLearningRequestCard
      endpoint="/api/synthetic/wish"
      initial={lessonWish}
      initialCandidate={practiceFixture.candidate}
      practiceEndpoint="/api/synthetic/practice"
      initialPractice={{
        allowed: !new URLSearchParams(window.location.search).has('stopped'),
        current: new URLSearchParams(window.location.search).has('resume')
          ? new URLSearchParams(window.location.search).has('verified')
            ? verifiedPracticeFixture
            : new URLSearchParams(window.location.search).has('support')
              ? supportedPracticeFixture
              : practiceFixture
          : null,
      }}
    />
  ) : new URLSearchParams(window.location.search).has('lesson-candidate') ? (
    <LearningCandidateCard
      endpoint="/api/synthetic/lesson-candidate"
      request={lessonWish}
      initial={
        new URLSearchParams(window.location.search).has('confirmed')
          ? { ...lessonCandidate, confirmedAt: '2026-10-13T00:00:00Z' }
          : null
      }
    />
  ) : new URLSearchParams(window.location.search).has('training-setup') ? (
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
  ) : new URLSearchParams(window.location.search).has('learning-request') ? (
    <PersonalLearningRequestCard
      endpoint="/api/services/synthetic/learning-request"
      initial={
        new URLSearchParams(window.location.search).has('resume')
          ? {
              id: 'synthetic',
              revision: 1,
              createdAt: '2026-10-12T00:00:00Z',
              originalText: 'AIで発表の練習をしたい',
              deviceType: 'PC',
              toolDescription: null,
              experienceDescription: null,
              currentPosition: '発表の資料を作った',
            }
          : null
      }
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
