import {
  createLineRichMenuResponse,
  listLineRichMenusResponse,
} from '../../../../src/http/line-rich-menus';

export const dynamic = 'force-dynamic';
export const GET = (request: Request) => listLineRichMenusResponse(request);
export const POST = (request: Request) => createLineRichMenuResponse(request);
