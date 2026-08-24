import { lineRichMenuImageResponse } from '../../../../../../src/http/line-rich-menus';

export const dynamic = 'force-dynamic';
export const GET = async (request: Request, context: { params: Promise<{ richMenuId: string }> }) =>
  lineRichMenuImageResponse(request, (await context.params).richMenuId);
