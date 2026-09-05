import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LineRichMenuArea } from '@bunshin/application';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

export const DEFAULT_LINE_RICH_MENU = {
  name: '標準メニュー',
  description: 'システムが用意した標準の4ボタンメニュー',
  width: 2500,
  height: 1686,
  areas: [
    { action: 'OPEN_TODAY', x: 0, y: 0, width: 1250, height: 843, sortOrder: 0 },
    { action: 'OPEN_BUNSHINS', x: 1250, y: 0, width: 1250, height: 843, sortOrder: 1 },
    {
      action: 'OPEN_NOTIFICATION_SETTINGS',
      x: 0,
      y: 843,
      width: 1250,
      height: 843,
      sortOrder: 2,
    },
    { action: 'OPEN_ACCOUNT', x: 1250, y: 843, width: 1250, height: 843, sortOrder: 3 },
  ] satisfies LineRichMenuArea[],
} as const;

const items = [
  { title: '今日やること', subtitle: '今日の予定を確認', symbol: '✓', color: '#2563eb' },
  { title: '分身を見る', subtitle: 'あなたの分身一覧', symbol: '人', color: '#7c3aed' },
  { title: 'お知らせ設定', subtitle: '通知方法を変更', symbol: '●', color: '#db2777' },
  { title: 'アカウント', subtitle: '登録情報を確認', symbol: '○', color: '#059669' },
] as const;

export async function renderDefaultLineRichMenu(): Promise<Buffer> {
  const fontDirectory = join(process.cwd(), 'assets/fonts/noto-sans-jp');
  const regularFont = join(fontDirectory, 'NotoSansCJKjp-Regular.otf');
  const boldFont = join(fontDirectory, 'NotoSansCJKjp-Bold.otf');
  await Promise.all([readFile(regularFont), readFile(boldFont)]);

  const cells = items
    .map((item, index) => {
      const x = (index % 2) * 1250;
      const y = Math.floor(index / 2) * 843;
      const centerX = x + 625;
      const background = index % 3 === 0 ? '#ffffff' : '#f8fafc';
      return `<g>
        <rect x="${x}" y="${y}" width="1250" height="843" fill="${background}" />
        <circle cx="${centerX}" cy="${y + 265}" r="105" fill="${item.color}" />
        <text x="${centerX}" y="${y + 300}" text-anchor="middle" fill="#ffffff" font-size="100" font-weight="700">${item.symbol}</text>
        <text x="${centerX}" y="${y + 510}" text-anchor="middle" fill="#0f172a" font-size="82" font-weight="700">${item.title}</text>
        <text x="${centerX}" y="${y + 620}" text-anchor="middle" fill="#64748b" font-size="42" font-weight="400">${item.subtitle}</text>
      </g>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2500" height="1686" viewBox="0 0 2500 1686">
    <rect width="2500" height="1686" fill="#f8fafc" />
    ${cells}
    <path d="M1250 0V1686M0 843H2500" stroke="#e2e8f0" stroke-width="4" />
  </svg>`;
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: DEFAULT_LINE_RICH_MENU.width },
    font: {
      loadSystemFonts: false,
      fontFiles: [regularFont, boldFont],
      defaultFontFamily: 'Noto Sans CJK JP',
    },
  })
    .render()
    .asPng();
  return sharp(png).png({ compressionLevel: 9, palette: true }).toBuffer();
}
