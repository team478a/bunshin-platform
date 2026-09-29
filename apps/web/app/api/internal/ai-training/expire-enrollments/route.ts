import { trainingEnrollmentExpiryResponse } from '../../../../../src/http/ai-training-enrollment-expiry';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  return trainingEnrollmentExpiryResponse(request);
}
