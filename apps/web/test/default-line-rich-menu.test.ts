import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import sharp from 'sharp';
import {
  DEFAULT_LINE_RICH_MENU,
  renderDefaultLineRichMenu,
  renderPersonalLearningLineRichMenu,
} from '../src/line/default-rich-menu';

describe('default LINE rich menu', () => {
  it('固定された4つの安全な操作を2×2に配置する', () => {
    expect(DEFAULT_LINE_RICH_MENU.areas.map((area) => area.action)).toEqual([
      'OPEN_TODAY',
      'OPEN_BUNSHINS',
      'OPEN_NOTIFICATION_SETTINGS',
      'OPEN_ACCOUNT',
    ]);
    expect(DEFAULT_LINE_RICH_MENU.areas).toHaveLength(4);
  });

  it('LINE仕様内のPNG画像を生成する', async () => {
    const image = await renderDefaultLineRichMenu();
    const metadata = await sharp(image).metadata();
    expect(metadata).toMatchObject({ format: 'png', width: 2500, height: 1686 });
    expect(image.byteLength).toBeLessThanOrEqual(1_000_000);
  }, 20_000);

  it('既存の課題タイトルを利用者専用PNGに安全に反映する', async () => {
    const image = await renderPersonalLearningLineRichMenu('<自分で直す>');
    const metadata = await sharp(image).metadata();
    expect(metadata).toMatchObject({ format: 'png', width: 2500, height: 1686 });
    expect(image.byteLength).toBeLessThanOrEqual(1_000_000);
  }, 20_000);

  it('空の課題名では不完全な個別メニューを生成しない', async () => {
    await expect(renderPersonalLearningLineRichMenu('  ')).rejects.toThrow(
      'personal learning practice title required',
    );
  });
});
