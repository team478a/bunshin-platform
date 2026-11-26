import { z } from 'zod';

export const dialogueRoles = ['mentor', 'junior'] as const;
export const dialogueRole = z.enum(dialogueRoles);
export type DialogueRole = z.infer<typeof dialogueRole>;

const roleSetting = z.strictObject({
  name: z.string().trim().min(1).max(18),
  voiceId: z.number().int().min(0).max(1_000_000),
});

export const dialogueDraftSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(48),
    roles: z.strictObject({ mentor: roleSetting, junior: roleSetting }),
    diagram: z.tuple([
      z.string().trim().min(1).max(28),
      z.string().trim().min(1).max(28),
      z.string().trim().min(1).max(28),
    ]),
    lines: z
      .array(
        z.strictObject({
          id: z.string().regex(/^[a-z0-9-]{1,40}$/u),
          role: dialogueRole,
          text: z.string().trim().min(1).max(120),
          reading: z.string().trim().max(140),
          pause: z.number().min(0.12).max(2),
          arrow: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
          cue: z.string().trim().max(24),
        }),
      )
      .min(2)
      .max(8),
  })
  .superRefine((draft, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (new Set(draft.lines.map(({ id }) => id)).size !== draft.lines.length)
      add('台詞の識別子が重複しています。');
    if (!dialogueRoles.every((role) => draft.lines.some((line) => line.role === role)))
      add('先輩と新人にそれぞれ台詞を入力してください。');
    if (draft.roles.mentor.voiceId === draft.roles.junior.voiceId)
      add('先輩と新人には異なる声を選んでください。');
    const arrows = draft.lines.map(({ arrow }) => arrow).filter(Boolean);
    if (arrows.some((arrow, index) => arrow !== index + 1))
      add('矢印は発話順に1から指定してください。');
    if (
      draft.lines.some(
        ({ arrow, cue, text }) =>
          (arrow > 0 && !cue) ||
          (text.includes('｜') &&
            (!cue ||
              text.split('｜').length !== 2 ||
              text.split('｜').some((part) => !part.trim()))),
      )
    )
      add('矢印や字幕切り替えに使う発話の合図を入力してください。');
  });

export type DialogueDraft = z.infer<typeof dialogueDraftSchema>;
export type DialogueLine = DialogueDraft['lines'][number];
export type DialogueVoice = { id: number; name: string };
export type DialogueSummary = {
  renderId: string;
  durationSeconds: number;
  audioGenerated: string[];
  audioReused: string[];
  clipsGenerated: string[];
  clipsReused: string[];
  portraits: Record<DialogueRole, { reused: boolean; sha256: string }>;
  timings: { id: string; role: DialogueRole; from: number; through: number }[];
  arrows: { lineId: string; seconds: number; frame: number; source: string }[];
  captions: { lineId: string; seconds: number; endSeconds: number; lines: string[] }[];
};

export function travelExpenseDialogue(voiceIds: [number, number]): DialogueDraft {
  return {
    title: '出張の交通費申請',
    roles: {
      mentor: { name: '先輩', voiceId: voiceIds[0] },
      junior: { name: '新人', voiceId: voiceIds[1] },
    },
    diagram: ['社内案内を検索する', '申請窓口が表示される', '領収書を送信する'],
    lines: [
      {
        id: 'question',
        role: 'junior',
        text: '領収書はどこに出せばいいですか？',
        reading: 'リョーシューショワ、ドコニダセバイイデスカ？',
        pause: 0.35,
        arrow: 0,
        cue: '',
      },
      {
        id: 'search',
        role: 'mentor',
        text: 'まず、｜社内案内で「交通費申請」と検索します。',
        reading: 'マズ、シャナイアンナイデ、コーツーヒシンセートケンサクシマス。',
        pause: 0.4,
        arrow: 1,
        cue: 'シャナイ',
      },
      {
        id: 'desk',
        role: 'mentor',
        text: '検索結果から、｜申請窓口を開きます。',
        reading: 'ケンサクケッカカラ、シンセーマドグチオヒラキマス。',
        pause: 0.4,
        arrow: 2,
        cue: 'シンセー',
      },
      {
        id: 'send',
        role: 'mentor',
        text: '窓口が表示されたら、｜領収書を添付して送信します。',
        reading: 'マドグチガヒョージサレタラ、リョーシューショオテンプシテソーシンシマス。',
        pause: 0.4,
        arrow: 3,
        cue: 'リョーシューショ',
      },
      {
        id: 'recap',
        role: 'junior',
        text: '社内案内で探して、見つけた申請窓口から領収書を送るんですね。',
        reading: '',
        pause: 0.4,
        arrow: 0,
        cue: '',
      },
    ],
  };
}

export function blankDialogue(
  title: string,
  instruction: string,
  voiceIds: [number, number],
): DialogueDraft {
  return {
    title: title.slice(0, 48),
    roles: {
      mentor: { name: '先輩', voiceId: voiceIds[0] },
      junior: { name: '新人', voiceId: voiceIds[1] },
    },
    diagram: ['最初の操作', '画面で確認する', '結果を確認する'],
    lines: [
      { id: 'question', role: 'junior', text: '', reading: '', pause: 0.35, arrow: 0, cue: '' },
      {
        id: 'explanation',
        role: 'mentor',
        text: instruction.slice(0, 120),
        reading: '',
        pause: 0.4,
        arrow: 0,
        cue: '',
      },
    ],
  };
}
