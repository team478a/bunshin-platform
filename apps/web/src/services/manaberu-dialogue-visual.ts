import { createHash, randomUUID } from 'node:crypto';
import { copyFile, link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import type { Local } from 'ai-video-engine';
import type { DialogueDraft, DialogueRole } from './manaberu-dialogue-model';

export type Portrait = { path: string; sha256: string; reused: boolean };
export const dialogueSha = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');

export async function dialoguePortrait(directory: string, role: DialogueRole): Promise<Portrait> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, role + '.png');
  try {
    const png = await readFile(path);
    return { path, sha256: dialogueSha(png), reused: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  // A new character drawing belongs to this account and role. The original is reused across lessons.
  const seed = createHash('sha256').update(randomUUID()).digest();
  const body = role === 'mentor' ? '#214455' : '#563956';
  const backdrop = 'hsl(' + (seed.readUInt16LE(0) % 360) + ', 35%, 57%)';
  const hair = ['#242638', '#483433', '#273b45', '#513244'][seed[2]! % 4]!;
  const skin = ['#f6caa5', '#e9ae88', '#c88e69', '#a66d55'][seed[3]! % 4]!;
  const hairline = 39 + (seed[4]! % 16);
  const accent = '#' + seed.subarray(5, 8).toString('hex');
  const fringe =
    role === 'mentor'
      ? 'M44 69Q42 27 81 26q36 0 35 47-21-9-29-32Q73 63 44 69'
      : 'M45 72q-6-29 20-42 10-17 24-5 28-1 29 37l-14 16q1-21-18-19l-8-12-13 15-8-8Z';
  const accessory =
    role === 'mentor'
      ? '<path d="M56 75h22v12H56zm26 0h22v12H82zm-4 4h4" fill="none" stroke="#32434b" stroke-width="2.5"/>'
      : '<path d="M62 124l18 13 18-13" fill="none" stroke="#b899ae" stroke-width="4"/>';

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">' +
    '<rect width="160" height="160" rx="34" fill="' +
    backdrop +
    '"/>' +
    '<circle cx="131" cy="29" r="10" fill="' +
    accent +
    '"/>' +
    '<path d="M16 160v-15q8-40 64-40t64 40v15" fill="' +
    body +
    '"/>' +
    '<ellipse cx="80" cy="72" rx="42" ry="' +
    hairline +
    '" fill="' +
    hair +
    '"/>' +
    '<rect x="67" y="92" width="26" height="27" rx="9" fill="' +
    skin +
    '"/>' +
    '<ellipse cx="80" cy="78" rx="32" ry="39" fill="' +
    skin +
    '"/>' +
    '<path d="' +
    fringe +
    '" fill="' +
    hair +
    '"/>' +
    '<circle cx="67" cy="79" r="3" fill="#25252a"/><circle cx="94" cy="79" r="3" fill="#25252a"/>' +
    accessory +
    '<path d="M71 95q9 9 18 0" fill="none" stroke="#75473b" stroke-width="3" stroke-linecap="round"/></svg>';
  const png = new Resvg(svg).render().asPng();
  const temporary = path + '.' + randomUUID();
  await writeFile(temporary, png, { mode: 0o600 });
  try {
    await link(temporary, path);
    return { path, sha256: dialogueSha(png), reused: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return { path, sha256: dialogueSha(await readFile(path)), reused: true };
  } finally {
    await rm(temporary, { force: true });
  }
}

const font =
  process.env['MANABERU_DIALOGUE_FONT'] ??
  (process.platform === 'win32'
    ? join(process.env['WINDIR'] ?? 'C:/Windows', 'Fonts', 'YuGothB.ttc')
    : '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc');

const brand =
  process.env['MANABERU_DIALOGUE_VOICEVOX_BRAND'] === 'VOICEVOX Nemo'
    ? 'VOICEVOX Nemo'
    : 'VOICEVOX';
export const dialogueCutRevision = 'manaberu-dialogue-cut-1:' + dialogueSha(font + ':' + brand);

export async function dialogueCut(
  directory: string,
  target: string,
  draft: DialogueDraft,
  role: DialogueRole,
  arrow: number,
  completedArrows: number,
  local: Local,
  portraits: Record<DialogueRole, Portrait>,
  encode: (args: string[], cwd: string) => Promise<unknown>,
) {
  await mkdir(directory, { recursive: true });
  await copyFile(font, join(directory, 'font.ttc'));
  const filters: string[] = [];
  function box(x: number, y: number, width: number, height: number, color: string, frame?: number) {
    filters.push(
      'drawbox=' +
        [x, y, width, height, color, 'fill'].join(':') +
        (frame === undefined ? '' : ":enable='gte(n," + frame + ")'"),
    );
  }
  let labelNumber = 0;
  async function label(
    value: string,
    x: string | number,
    y: number,
    size: number,
    color = 'white',
  ) {
    const file = 'label-' + ++labelNumber + '.txt';
    await writeFile(join(directory, file), value, 'utf8');
    filters.push(
      'drawtext=fontfile=font.ttc:textfile=' +
        file +
        ':expansion=none:fontcolor=' +
        color +
        ':fontsize=' +
        size +
        ':x=' +
        x +
        ':y=' +
        y +
        ':line_spacing=8',
    );
  }
  const wrap = (value: string, size: number) =>
    Array.from(value)
      .reduce<string[]>((rows, char, index) => {
        if (index % size === 0) rows.push(char);
        else rows[rows.length - 1] += char;
        return rows;
      }, [])
      .join('\n');

  await label('マナベルスタイル', 58, 64, 24, '0xadd4db');
  await label(wrap(draft.title, 18), 58, 117, 34);
  box(58, 232, 604, 2, '0x42626c');
  for (const [index, text] of draft.diagram.entries()) {
    const y = 275 + index * 156;
    const lit = index < completedArrows;
    box(110, y, 500, 82, lit ? '0x235868' : '0x203d4c');
    await label(String(index + 1), 135, y + 26, 28, '0x9cdae0');
    await label(wrap(text, 15), 190, y + 16, 26);
    if (index < completedArrows || arrow === index + 1) {
      const timing = arrow === index + 1 ? local.diagram : undefined;
      box(110, y, 6, 82, '0x80ded9', timing?.completionFrame);
      const length = 42;
      for (let part = 0; part < 7; part += 1) {
        const frame =
          timing && Math.round(timing.frame + ((timing.completionFrame - timing.frame) * part) / 7);
        box(357, y - 58 + part * 6, 6, length / 7 + 1, '0x80ded9', frame);
      }
      for (let part = 0; part < 4; part += 1)
        box(
          349 + part * 2,
          y - 16 + part * 2,
          22 - part * 4,
          3,
          '0x80ded9',
          timing?.completionFrame,
        );
    }
  }
  for (const [index, current] of (['mentor', 'junior'] as const).entries()) {
    const x = 82 + index * 284;
    box(x, 808, 272, 232, current === role ? '0x24596b' : '0x1c3948');
    await label(draft.roles[current].name, x + '+136-tw/2', 996, 25);
  }
  await label(brand, 54, 1087, 18, '0xadd4db');

  const filter =
    '[0:v]' +
    filters.join(',') +
    '[bg];[bg][1:v]overlay=138:824[mentor];[mentor][2:v]overlay=422:824[out]';
  await encode(
    [
      '-f',
      'lavfi',
      '-i',
      'color=c=0x142c38:s=720x1280:r=24',
      '-i',
      portraits.mentor.path,
      '-i',
      portraits.junior.path,
      '-filter_complex_threads',
      '1',
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-frames:v',
      String(local.frames),
      '-an',
      '-c:v',
      'libx264',
      '-threads',
      '2',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      target,
    ],
    directory,
  );
}
