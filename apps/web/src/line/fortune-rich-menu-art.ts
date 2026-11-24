import 'server-only';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import {
  FORTUNE_LINE_MENU_ITEMS,
  ORACLE_LINE_MENU_ITEMS,
  ORACLE_LINE_MENU_SIZE,
} from './fortune-rich-menu-content';

const icons = [
  '<path d="M124 18a67 67 0 1 0 61 102A64 64 0 0 1 124 18Z"/><path d="M154 25v35m-17-17h35"/>',
  '<rect x="32" y="25" width="82" height="121" rx="12" transform="rotate(-15 73 86)"/><rect x="89" y="18" width="84" height="127" rx="12" fill="#272242"/><path d="M132 46c3 20 10 27 29 31-19 4-26 11-29 31-4-20-11-27-30-31 19-4 26-11 30-31Z"/>',
  '<path d="M47 110h113l-17-26V67a39 39 0 1 0-78 0v17zm38 17a18 18 0 0 0 35 0M104 19v-9M31 65l-10 10m152-10 10 10"/>',
  '<path d="M103 127c-20-17-49-23-81-18V36c32-5 61 1 81 18 20-17 49-23 81-18v73c-32-5-61 1-81 18zm0-73v73M40 62c15-1 31 3 44 11m39 0c13-8 29-12 44-11"/>',
];

const ornaments = [
  [173, 118, 1],
  [1051, 132, 0.86],
  [228, 319, 0.55],
  [1008, 327, 0.56],
  [350, 125, 0.34],
  [907, 116, 0.38],
  [184, 228, 0.34],
  [1057, 236, 0.36],
] as const;

const star = (x: number, y: number, scale: number) =>
  `<path transform="translate(${x} ${y}) scale(${scale})" d="M0-33C4-11 11-4 33 0 11 4 4 11 0 33-4 11-11 4-33 0-11-4-4-11 0-33Z" fill="none" stroke="currentColor" stroke-width="3"/>`;

export async function renderFortuneLineRichMenu(brandLogo?: Buffer): Promise<Buffer> {
  // The first cell is the primary action. Each illustrated cell stays entirely within its tap area.
  const cells = FORTUNE_LINE_MENU_ITEMS.map(({ title, subtitle }, index) => {
    const x = (index % 2) * 1250;
    const y = Math.floor(index / 2) * 843;
    const light = index === 0 || index === 3;
    const accent = light ? '#8a6227' : '#edd29a';
    const text = light ? '#25203f' : '#fff4de';
    const subtext = light ? '#5c4b57' : '#e1d5e6';
    return `<g transform="translate(${x} ${y})" color="${accent}">
      <rect x="20" y="20" width="1210" height="803" rx="38" fill="url(#${light ? 'ivory' : 'night'})" />
      <rect x="48" y="48" width="1154" height="747" rx="25" fill="none" stroke="${accent}" stroke-opacity="0.52" stroke-width="3" />
      <rect x="61" y="61" width="1128" height="721" rx="19" fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="2" />
      <path d="M123 368Q625 12 1127 368" fill="none" stroke="${accent}" stroke-opacity="0.18" stroke-width="3"/>
      ${ornaments.map(([cx, cy, scale]) => star(cx, cy, scale)).join('')}
      ${
        index === 0 && brandLogo
          ? '<rect x="258" y="115" width="734" height="243" rx="28" fill="#fefefe" stroke="#b38a51" stroke-width="2" />'
          : `<circle cx="625" cy="245" r="125" fill="none" stroke="${accent}" stroke-opacity="0.52" stroke-width="3"/>
          <circle cx="625" cy="245" r="107" fill="none" stroke="${accent}" stroke-opacity="0.24" stroke-width="2"/>
          <g transform="translate(519 163)" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${icons[index]}</g>`
      }
      <path d="M347 421h216m124 0h216" stroke="${accent}" stroke-opacity="0.68" stroke-width="2"/>
      ${star(625, 421, 0.56)}
      <text x="625" y="565" text-anchor="middle" fill="${text}" font-size="111" font-weight="700">${title}</text>
      <text x="625" y="673" text-anchor="middle" fill="${subtext}" font-size="54" font-weight="400">${subtitle}</text>
    </g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2500" height="1686" viewBox="0 0 2500 1686">
    <defs>
      <linearGradient id="ivory" x2="0" y2="1"><stop stop-color="#faf4e8"/><stop offset="1" stop-color="#efe1ca"/></linearGradient>
      <linearGradient id="night" x2="0" y2="1"><stop stop-color="#282247"/><stop offset="1" stop-color="#19162f"/></linearGradient>
    </defs>
    <rect width="2500" height="1686" fill="#211b38" />
    ${cells}
  </svg>`;
  const png = renderFortuneMenuSvg(svg);
  const image = sharp(png);
  if (brandLogo) {
    const logo = await sharp(brandLogo)
      .resize(700, 225, { fit: 'contain', background: '#fefefe' })
      .png()
      .toBuffer();
    image.composite([{ input: logo, left: 275, top: 124 }]);
  }
  return image.png({ compressionLevel: 9, palette: true }).toBuffer();
}

function renderFortuneMenuSvg(svg: string) {
  const fonts = join(process.cwd(), 'assets/fonts/noto-sans-jp');
  return new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles: [join(fonts, 'NotoSansCJKjp-Regular.otf'), join(fonts, 'NotoSansCJKjp-Bold.otf')],
      defaultFontFamily: 'Noto Sans CJK JP',
    },
  })
    .render()
    .asPng();
}

const oracleIcons = {
  moon: icons[0],
  cards: icons[1],
  people:
    '<circle cx="75" cy="59" r="22"/><path d="M31 133v-11c0-18 16-31 36-31h16c20 0 36 13 36 31v11M128 44a19 19 0 1 1 0 38m5 11c21 1 37 13 37 30v10"/>',
  gift: '<rect x="38" y="68" width="130" height="31" rx="5"/><path d="M47 99v43h112V99M103 142V68m0 0H72a17 17 0 1 1 14-27zm0 0h31a17 17 0 1 0-14-27z"/>',
  bell: icons[2],
  book: icons[3],
};

export async function renderOracleLineRichMenu(): Promise<Buffer> {
  const { width, height } = ORACLE_LINE_MENU_SIZE;
  const cells = ORACLE_LINE_MENU_ITEMS.map(({ title, icon, bounds }, index) => {
    const center = bounds.width / 2;
    const primary = index === 0;
    const accent = primary ? '#845b26' : '#dec18a';
    const text = primary ? '#211a3a' : '#fff3df';
    return `<g transform="translate(${bounds.x} ${bounds.y})" color="${accent}">
      <rect x="14" y="14" width="${bounds.width - 28}" height="${bounds.height - 28}" rx="37" fill="url(#${primary ? 'ivory' : 'night'})"/>
      <rect x="40" y="40" width="${bounds.width - 80}" height="${bounds.height - 80}" rx="19" fill="none" stroke="currentColor" stroke-opacity="0.42" stroke-width="3"/>
      <circle cx="${center}" cy="330" r="146" fill="none" stroke="currentColor" stroke-opacity="0.38" stroke-width="3"/>
      <circle cx="${center}" cy="330" r="127" fill="none" stroke="currentColor" stroke-opacity="0.2" stroke-width="2"/>
      ${star(center - 222, 254, 0.5)}
      ${star(center + 210, 374, 0.3)}
      ${star(center + 204, 225, 0.63)}
      <g transform="translate(${center - 103} 244)" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">${oracleIcons[icon]}</g>
      <text x="${center}" y="635" text-anchor="middle" fill="${text}" font-size="${primary ? 116 : 99}" font-weight="700" letter-spacing="5">${title}</text>
    </g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="ivory" x2="1" y2="1"><stop stop-color="#fff6e3"/><stop offset="1" stop-color="#e7d0a4"/></linearGradient>
      <radialGradient id="night" cx=".5" cy=".33" r=".77"><stop stop-color="#33264f"/><stop offset="1" stop-color="#17152e"/></radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="#151229"/>
    ${cells}
  </svg>`;
  return sharp(renderFortuneMenuSvg(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
}
