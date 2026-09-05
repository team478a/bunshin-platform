import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LineRichMenuArea } from '@bunshin/application';
import { Resvg } from '@resvg/resvg-js';
import { createElement } from 'react';
import satori from 'satori';
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
  const [regular, bold] = await Promise.all([
    readFile(join(fontDirectory, 'NotoSansCJKjp-Regular.otf')),
    readFile(join(fontDirectory, 'NotoSansCJKjp-Bold.otf')),
  ]);
  const tree = createElement(
    'div',
    {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        width: '2500px',
        height: '1686px',
        background: '#f8fafc',
        fontFamily: 'Noto Sans JP',
      },
    },
    ...items.map((item, index) =>
      createElement(
        'div',
        {
          key: item.title,
          style: {
            display: 'flex',
            width: '1250px',
            height: '843px',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            background: index % 3 === 0 ? '#ffffff' : '#f8fafc',
            borderRight: index % 2 === 0 ? '4px solid #e2e8f0' : '0',
            borderBottom: index < 2 ? '4px solid #e2e8f0' : '0',
          },
        },
        createElement(
          'div',
          {
            style: {
              display: 'flex',
              width: '210px',
              height: '210px',
              borderRadius: '105px',
              alignItems: 'center',
              justifyContent: 'center',
              background: item.color,
              color: '#ffffff',
              fontSize: '100px',
              fontWeight: 700,
            },
          },
          item.symbol,
        ),
        createElement(
          'div',
          {
            style: {
              display: 'flex',
              marginTop: '42px',
              fontSize: '82px',
              fontWeight: 700,
              color: '#0f172a',
            },
          },
          item.title,
        ),
        createElement(
          'div',
          { style: { display: 'flex', marginTop: '18px', fontSize: '42px', color: '#64748b' } },
          item.subtitle,
        ),
      ),
    ),
  );
  const svg = await satori(tree, {
    width: DEFAULT_LINE_RICH_MENU.width,
    height: DEFAULT_LINE_RICH_MENU.height,
    fonts: [
      { name: 'Noto Sans JP', data: regular, weight: 400, style: 'normal' },
      { name: 'Noto Sans JP', data: bold, weight: 700, style: 'normal' },
    ],
  });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: DEFAULT_LINE_RICH_MENU.width } })
    .render()
    .asPng();
  return sharp(png).png({ compressionLevel: 9, palette: true }).toBuffer();
}
