import { commercialAutomaticCollectionResponse } from '../../../../../src/http/commercial-automatic-collection';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return commercialAutomaticCollectionResponse(request);
}
