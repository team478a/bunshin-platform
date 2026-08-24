import { disableLineRichMenuResponse } from '../../../../../../src/http/line-rich-menus';

export const POST = async (
  request: Request,
  context: { params: Promise<{ richMenuId: string }> },
) => disableLineRichMenuResponse(request, (await context.params).richMenuId);
