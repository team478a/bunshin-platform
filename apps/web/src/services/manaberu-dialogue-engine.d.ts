declare module 'ai-video-engine' {
  export type Scope = { ownerId: string; projectId: string };
  export type Output = { width: number; height: number; fps: number };
  export type Media = { ref: string; sha256: string };
  export type Speech = Media & {
    durationSeconds: number;
    cues: Record<string, { seconds: number; source: 'aligned' | 'measured' }>;
  };
  export type Local = {
    frames: number;
    leadSeconds: number;
    captions: { lines: string[]; seconds: number; endSeconds: number }[];
    diagram?: {
      id: string;
      seconds: number;
      frame: number;
      completionFrame: number;
      source: string;
    };
  };
  export type Line<Visual> = {
    id: string;
    role: string;
    spokenText: string;
    holdAfterSpeechSeconds: number;
    captionPages: { lines: string[]; startAtMora?: string }[];
    diagramAction?: { id: string; startAtMora: string; durationSeconds: number };
    visual: Visual;
  };
  export type Composition = {
    mp4Ref: string;
    previewRef: string;
    subtitleRef?: string;
    actualDurationSeconds: number;
    decodeVerified: boolean;
  };
  export type Timeline = {
    scope: Scope;
    output: Output;
    durationSeconds: number;
    entries: {
      id: string;
      role: string;
      audio: Speech;
      clip: Media;
      audioKey: string;
      clipKey: string;
      speechStartSeconds: number;
      speechEndSeconds: number;
      firstFrame: number;
      local: Local;
      audioReused: boolean;
      clipReused: boolean;
    }[];
    captions: { lineId: string; lines: string[]; seconds: number; endSeconds: number }[];
    diagramEvents: { lineId: string; frame: number; seconds: number; source: string }[];
  };
  export type Receipt = Timeline & {
    result: Composition;
    changes: {
      audioGenerated: string[];
      audioReused: string[];
      clipsGenerated: string[];
      clipsReused: string[];
    };
  };
  export function renderDialogue<Visual>(
    input: {
      scope: Scope;
      base?: Receipt;
      project: {
        id: string;
        roles: Record<string, number>;
        output: Output;
        lines: Line<Visual>[];
        openingPauseSeconds?: number;
      };
    },
    adapters: {
      speechRevision: string;
      clipRevision: string;
      synthesize: (input: { line: Line<Visual>; voice: number }) => Promise<Speech>;
      renderClip: (input: { line: Line<Visual>; local: Local; output: Output }) => Promise<Media>;
      compose: (timeline: Timeline) => Promise<Composition>;
    },
  ): Promise<Receipt>;
}

declare module 'ai-video-engine/ffmpeg' {
  import type { Composition, Scope, Timeline } from 'ai-video-engine';
  export function createFfmpegComposer(options: {
    outputDirectory: string;
    resolveAsset: (scope: Scope, ref: string) => string;
    ffmpeg: string;
    ffprobe: string;
  }): (timeline: Timeline) => Promise<Composition>;
}
