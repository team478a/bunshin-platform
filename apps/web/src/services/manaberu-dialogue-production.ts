import 'server-only';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { renderDialogue, type Receipt, type Scope } from 'ai-video-engine';
import { createFfmpegComposer } from 'ai-video-engine/ffmpeg';
import {
  dialogueRoles,
  type DialogueDraft,
  type DialogueRole,
  type DialogueSummary,
} from './manaberu-dialogue-model';
import {
  dialogueCut,
  dialogueCutRevision,
  dialoguePortrait,
  dialogueSha,
} from './manaberu-dialogue-visual';
import { dialogueVoices, dialogueVoiceWav, normalizeDialogueCue } from './manaberu-dialogue-voice';

const run = promisify(execFile);
const output = { width: 720, height: 1280, fps: 24 };
const ffmpeg = process.env['MANABERU_DIALOGUE_FFMPEG'] || 'ffmpeg';
const ffprobe = process.env['MANABERU_DIALOGUE_FFPROBE'] || 'ffprobe';
const renders = new Set<string>();

type Actor = { workspaceId: string; actorId: string };
type Location = { materialId: string; ordinal: number };
type DraftState = { draft: DialogueDraft; updatedAt: string };
type RenderState = DraftState & { summary: DialogueSummary; receipt: Receipt };
export class DialogueProductionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function configuration() {
  const directory = process.env['MANABERU_DIALOGUE_MEDIA_DIR'];
  const voicevox = process.env['MANABERU_DIALOGUE_VOICEVOX_URL'];
  return directory && isAbsolute(directory) && voicevox
    ? { directory: resolve(directory), voicevox }
    : null;
}

export function dialogueEditorEnabled() {
  return configuration() !== null;
}

function storage(actor: Actor, location: Location) {
  const config = configuration();
  if (!config) throw new DialogueProductionError('会話教材の制作環境を利用できません。', 503);
  const ownerId = dialogueSha(JSON.stringify([actor.workspaceId, actor.actorId]));
  const projectId = dialogueSha(JSON.stringify([location.materialId, location.ordinal]));
  const directory = join(config.directory, ownerId, projectId);
  return {
    ...config,
    scope: { ownerId, projectId },
    directory,
    portraits: join(config.directory, ownerId, 'portraits'),
    draft: join(directory, 'draft.json'),
    render: join(directory, 'latest.json'),
  };
}

async function readJson<T>(file: string) {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function saveJson(file: string, value: unknown) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.' + randomUUID();
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  try {
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function readDialogueProject(actor: Actor, location: Location, signal: AbortSignal) {
  const project = storage(actor, location);
  const [draft, render] = await Promise.all([
    readJson<DraftState>(project.draft),
    readJson<RenderState>(project.render),
  ]);
  // Saved work and previous output remain readable when the speech engine is stopped.
  const voices = await dialogueVoices(
    project.voicevox,
    AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  ).catch(() => []);
  const current = draft && (!render || draft.updatedAt > render.updatedAt) ? draft : render;
  return { draft: current?.draft ?? null, summary: render?.summary ?? null, voices };
}

export async function saveDialogueProject(actor: Actor, location: Location, draft: DialogueDraft) {
  const project = storage(actor, location);
  if (renders.has(project.directory))
    throw new DialogueProductionError('この手順の試聴素材を作成しています。', 409);
  renders.add(project.directory);
  try {
    await saveJson(project.draft, { draft, updatedAt: new Date().toISOString() });
  } finally {
    renders.delete(project.directory);
  }
}

function voiceCaption(text: string) {
  const letters = Array.from(text.trim().replace(/\s+/gu, ' '));
  const lines: string[] = [];
  while (letters.length) lines.push(letters.splice(0, 22).join(''));
  return lines;
}

function projectLines(draft: DialogueDraft, portraits: DialogueSummary['portraits']) {
  let completedArrows = 0;
  return draft.lines.map((line) => {
    const cue = normalizeDialogueCue(line.cue);
    const captionPages = line.text.split('｜').map((text, index) => ({
      lines: voiceCaption(text),
      ...(index ? { startAtMora: cue } : {}),
    }));
    const visual = {
      title: draft.title,
      diagram: draft.diagram,
      roles: dialogueRoles.map((role) => [draft.roles[role].name, portraits[role].sha256]),
      completedArrows,
      arrow: line.arrow,
    };
    if (line.arrow) completedArrows = line.arrow;
    return {
      id: line.id,
      role: line.role,
      spokenText: line.reading || line.text.replaceAll('｜', ''),
      holdAfterSpeechSeconds: line.pause,
      visual,
      captionPages,
      ...(line.arrow
        ? { diagramAction: { id: String(line.arrow), startAtMora: cue, durationSeconds: 0.5 } }
        : {}),
    };
  });
}

function within(directory: string, reference: string) {
  const path = resolve(directory, reference);
  if (!path.startsWith(directory + sep)) throw new Error('Dialogue media outside project');
  return path;
}

function isSameScope(left: Scope, right: Scope) {
  return left.ownerId === right.ownerId && left.projectId === right.projectId;
}

export async function produceDialogue(
  actor: Actor,
  location: Location,
  draft: DialogueDraft,
  requestSignal: AbortSignal,
): Promise<DialogueSummary> {
  const project = storage(actor, location);
  if (renders.has(project.directory))
    throw new DialogueProductionError('この手順の試聴素材を作成しています。', 409);
  renders.add(project.directory);
  const scratch: string[] = [];
  let committed = false;
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(175_000)]);
  try {
    await mkdir(project.directory, { recursive: true, mode: 0o700 });
    const previous = await readJson<RenderState>(project.render);
    const voices = await dialogueVoices(project.voicevox, signal);
    if (dialogueRoles.some((role) => !voices.some(({ id }) => id === draft.roles[role].voiceId)))
      throw new DialogueProductionError('現在使えるVOICEVOXの声を二人分選んでください。', 422);
    const [mentor, junior] = await Promise.all(
      dialogueRoles.map((role) => dialoguePortrait(project.portraits, role)),
    );
    if (!mentor || !junior) throw new Error('Dialogue portraits missing');
    const portraits = { mentor, junior };
    const portraitSummary = {
      mentor: { reused: mentor.reused, sha256: mentor.sha256 },
      junior: { reused: junior.reused, sha256: junior.sha256 },
    };
    const lines = projectLines(draft, portraitSummary);
    const receipt = await renderDialogue(
      {
        scope: project.scope,
        ...(previous ? { base: previous.receipt } : {}),
        project: {
          id: project.scope.projectId,
          output,
          lines,
          roles: { mentor: draft.roles.mentor.voiceId, junior: draft.roles.junior.voiceId },
          openingPauseSeconds: 0.7,
        },
      },
      {
        speechRevision: 'manaberu-voicevox-1:' + dialogueSha(project.voicevox),
        clipRevision: dialogueCutRevision,
        synthesize: async ({ line, voice }) => {
          const raw = await dialogueVoiceWav(project.voicevox, line.spokenText, voice, signal);
          const captionCues = line.captionPages.slice(1).map((page) => page.startAtMora);
          if (
            [...captionCues, line.diagramAction?.startAtMora].some((cue) => cue && !raw.cues[cue])
          )
            throw new DialogueProductionError(
              '台詞「' +
                line.spokenText.slice(0, 20) +
                '」で、指定した発話の合図が見つかりません。読みを確認してください。',
              422,
            );
          const temporary = await mkdtemp(join(project.directory, 'speech-'));
          scratch.push(temporary);
          const ref = randomUUID() + '.wav';
          const target = join(project.directory, ref);
          scratch.push(target);
          const source = join(temporary, 'line.wav');
          await writeFile(source, raw.bytes);
          const pan =
            line.role === 'mentor' ? 'pan=stereo|c0=c0|c1=0.20*c0' : 'pan=stereo|c0=0.20*c0|c1=c0';
          await run(
            ffmpeg,
            [
              '-nostdin',
              '-v',
              'error',
              '-y',
              '-i',
              source,
              '-af',
              pan,
              '-c:a',
              'pcm_s16le',
              target,
            ],
            { signal, timeout: 12_000, windowsHide: true },
          );
          const { stdout } = await run(
            ffprobe,
            ['-v', 'error', '-of', 'csv=p=0', '-show_entries', 'format=duration', target],
            { signal, timeout: 12_000, windowsHide: true },
          );
          const durationSeconds = Number(stdout.trim());
          const cues = Object.fromEntries(
            Object.entries(raw.cues).filter(([, cue]) => cue.seconds < durationSeconds),
          );
          return { ref, sha256: dialogueSha(await readFile(target)), durationSeconds, cues };
        },
        renderClip: async ({ line, local }) => {
          const temporary = await mkdtemp(join(project.directory, 'scene-'));
          scratch.push(temporary);
          const ref = randomUUID() + '.mp4';
          const target = join(project.directory, ref);
          scratch.push(target);
          await dialogueCut(
            temporary,
            target,
            draft,
            line.role as DialogueRole,
            line.visual.arrow,
            line.visual.completedArrows,
            local,
            portraits,
            (args, cwd) =>
              run(ffmpeg, ['-nostdin', '-v', 'error', '-y', ...args], {
                cwd,
                signal,
                timeout: 45_000,
                windowsHide: true,
              }),
          );
          return { ref, sha256: dialogueSha(await readFile(target)) };
        },
        compose: createFfmpegComposer({
          outputDirectory: project.directory,
          ffmpeg,
          ffprobe,
          resolveAsset: (scope, ref) => {
            if (!isSameScope(scope, project.scope) || !/^[a-f0-9-]{36}\.(wav|mp4)$/u.test(ref))
              throw new Error('Invalid manaberu media reference');
            return within(project.directory, ref);
          },
        }),
      },
    );
    scratch.push(dirname(receipt.result.mp4Ref));
    signal.throwIfAborted();
    const summary = {
      renderId: randomUUID(),
      durationSeconds: receipt.durationSeconds,
      ...receipt.changes,
      portraits: portraitSummary,
      timings: receipt.entries.map((item) => ({
        id: item.id,
        role: item.role as DialogueRole,
        from: item.speechStartSeconds,
        through: item.speechEndSeconds,
      })),
      arrows: receipt.diagramEvents,
      captions: receipt.captions,
    };
    await saveJson(project.render, {
      draft,
      updatedAt: new Date().toISOString(),
      summary,
      receipt,
    } satisfies RenderState);
    committed = true;
    const keep = new Set(receipt.entries.flatMap(({ audio, clip }) => [audio.ref, clip.ref]));
    const unused =
      previous?.receipt.entries
        .flatMap(({ audio, clip }) => [audio.ref, clip.ref])
        .filter((ref) => !keep.has(ref))
        .map((ref) => within(project.directory, ref)) ?? [];
    if (previous) unused.push(within(project.directory, dirname(previous.receipt.result.mp4Ref)));
    await cleanDialogueFiles(unused);
    return summary;
  } finally {
    try {
      await cleanDialogueFiles(
        committed ? scratch.filter((path) => /[\\/](?:speech|scene)-/u.test(path)) : scratch,
      );
    } finally {
      renders.delete(project.directory);
    }
  }
}

async function cleanDialogueFiles(paths: string[]) {
  const results = await Promise.allSettled(
    paths.map((path) => rm(path, { force: true, recursive: true })),
  );
  if (results.some((result) => result.status === 'rejected'))
    console.warn('manaberu_dialogue_cleanup_failed');
}

export async function readDialogueMedia(
  actor: Actor,
  location: Location,
  id: string,
  kind: 'mp4' | 'audio',
) {
  const project = storage(actor, location);
  const render = await readJson<RenderState>(project.render);
  if (
    !render ||
    render.summary.renderId !== id ||
    !isSameScope(render.receipt.scope, project.scope)
  )
    return null;
  return readFile(
    within(
      project.directory,
      kind === 'mp4' ? render.receipt.result.mp4Ref : render.receipt.result.previewRef,
    ),
  );
}
