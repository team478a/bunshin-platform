export const MANABERU_LINE_MENU_IMAGE_PATH = '/manaberu-line-menu.png';
export const MANABERU_LINE_MENU_SIZE = { width: 2500, height: 843 };
export const MANABERU_LINE_MENU_ITEMS = [
  { title: '学習を開く', path: 'home', bounds: { x: 0, y: 0, width: 1400, height: 843 } },
  {
    title: '実践を記録',
    path: 'home?learning=record',
    bounds: { x: 1400, y: 0, width: 1100, height: 421 },
  },
  {
    title: '困ったとき',
    path: 'help',
    bounds: { x: 1400, y: 421, width: 1100, height: 422 },
  },
] as const;
