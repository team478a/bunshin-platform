import type { LineRichMenuAction } from '@bunshin/application';

export const FORTUNE_LINE_MENU = {
  OPEN_TODAY: { title: '今日の占い', subtitle: '今日のカードを引く', path: 'today' },
  OPEN_BUNSHINS: { title: '鑑定履歴', subtitle: '過去の結果を読む', path: 'history' },
  OPEN_NOTIFICATION_SETTINGS: {
    title: '通知設定',
    subtitle: 'LINEのお知らせを管理',
    path: 'settings#fortune-notifications',
  },
  OPEN_ACCOUNT: { title: '使い方', subtitle: '占いの始め方・ヘルプ', path: 'manual' },
} as const satisfies Record<LineRichMenuAction, { title: string; subtitle: string; path: string }>;

export const FORTUNE_LINE_MENU_ITEMS = Object.values(FORTUNE_LINE_MENU);
export const ORACLE_LINE_MENU_IMAGE_PATH = '/tsuki-to-hoshi-oracle-line-menu.png';

export function isOracleLineService(serviceSlug: string | null | undefined) {
  return serviceSlug === 'watashi-fortune';
}
