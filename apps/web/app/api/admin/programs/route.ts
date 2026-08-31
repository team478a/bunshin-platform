import { createOfficialProgramResponse } from '../../../../src/http/programs';

export async function POST(request: Request) {
  return createOfficialProgramResponse(request);
}
