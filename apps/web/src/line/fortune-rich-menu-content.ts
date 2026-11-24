import type { LineRichMenuAction } from '@bunshin/application';

export const FORTUNE_LINE_MENU = {
  OPEN_TODAY: { title: '今日の占い', subtitle: 'カード鑑定・AI相談', path: 'today' },
  OPEN_BUNSHINS: { title: '鑑定履歴', subtitle: '過去の結果を読む', path: 'history' },
  OPEN_NOTIFICATION_SETTINGS: {
    title: '通知設定',
    subtitle: 'LINEのお知らせを管理',
    path: 'settings#fortune-notifications',
  },
  OPEN_ACCOUNT: { title: '使い方', subtitle: '占いの始め方・ヘルプ', path: 'manual' },
} as const satisfies Record<LineRichMenuAction, { title: string; subtitle: string; path: string }>;

export const FORTUNE_LINE_MENU_ITEMS = Object.values(FORTUNE_LINE_MENU);
const oracleLineItems = [
  { ...FORTUNE_LINE_MENU.OPEN_TODAY, icon: 'moon' },
  { ...FORTUNE_LINE_MENU.OPEN_BUNSHINS, icon: 'cards' },
  { title: '友だち紹介', path: 'activity', icon: 'people' },
  { title: '特典', path: 'credits', icon: 'gift' },
  { ...FORTUNE_LINE_MENU.OPEN_NOTIFICATION_SETTINGS, icon: 'bell' },
  { ...FORTUNE_LINE_MENU.OPEN_ACCOUNT, icon: 'book' },
] as const;

export const ORACLE_LINE_MENU_SIZE = { width: 2500, height: 1686 } as const;
export const ORACLE_LINE_MENU_ITEMS = oracleLineItems.map((item, index) => {
  const column = index % 3;
  const x = Math.round((column * ORACLE_LINE_MENU_SIZE.width) / 3);
  const right = Math.round(((column + 1) * ORACLE_LINE_MENU_SIZE.width) / 3);
  const height = ORACLE_LINE_MENU_SIZE.height / 2;
  return { ...item, bounds: { x, y: Math.floor(index / 3) * height, width: right - x, height } };
});
export const ORACLE_LINE_MENU_IMAGE_PATH = '/tsuki-to-hoshi-oracle-line-menu.png';

export function isOracleLineService(serviceSlug: string | null | undefined) {
  return serviceSlug === 'watashi-fortune';
}
