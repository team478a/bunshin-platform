import { verifyLineRichMenuResponse } from '../../../../../../src/http/line-rich-menus';

export const POST = async (
  request: Request,
  context: { params: Promise<{ richMenuId: string }> },
) => verifyLineRichMenuResponse(request, (await context.params).richMenuId);
