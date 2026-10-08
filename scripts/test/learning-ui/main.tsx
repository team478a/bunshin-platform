// Local browser harness only. No production route, credentials, DB or Provider.
import { createRoot } from 'react-dom/client';
import { PersonalLearningPilotCard } from '../../../apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-pilot-card';
import '../../../apps/web/app/styles.css';

createRoot(document.getElementById('root')!).render(
  <PersonalLearningPilotCard serviceSlug="synthetic" enrollmentId="synthetic" />,
);
