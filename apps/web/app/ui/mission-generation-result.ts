export async function missionGenerationResult(response: Response, requestId: string) {
  if (response.ok) return { message: '今日の投稿案を作りました。', refresh: true };
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string; requestId?: string; reason?: string };
  } | null;
  const detail = payload?.error?.message ?? '投稿案を作れませんでした。';
  return {
    message: `${detail}（受付番号: ${payload?.error?.requestId ?? requestId}）`,
    refresh: response.status === 409 && payload?.error?.reason === 'ALREADY_EXISTS',
  };
}
