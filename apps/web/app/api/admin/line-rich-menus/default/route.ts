import { createDefaultLineRichMenuResponse } from '../../../../../src/http/line-rich-menus';

export const dynamic = 'force-dynamic';
export const POST = (request: Request) => createDefaultLineRichMenuResponse(request);
