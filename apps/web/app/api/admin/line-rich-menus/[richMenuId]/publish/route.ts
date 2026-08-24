import { publishLineRichMenuResponse } from '../../../../../../src/http/line-rich-menus';

export const POST = async (
  request: Request,
  context: { params: Promise<{ richMenuId: string }> },
) => publishLineRichMenuResponse(request, (await context.params).richMenuId);
