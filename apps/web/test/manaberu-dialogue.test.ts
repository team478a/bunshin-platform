import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dialogueDraftSchema,
  travelExpenseDialogue,
} from '../src/services/manaberu-dialogue-model';
import { dialogueMoraStarts, normalizeDialogueCue } from '../src/services/manaberu-dialogue-voice';
import { dialoguePortrait } from '../src/services/manaberu-dialogue-visual';

describe('Manaberu dialogue', () => {
  it('requires distinct voices and ordered, measured arrow cues in the travel sample', () => {
    const draft = travelExpenseDialogue([10005, 10001]);
    expect(dialogueDraftSchema.safeParse(draft).success).toBe(true);
    draft.lines[1]!.cue = '';
    draft.lines[2]!.arrow = 3;
    const invalid = dialogueDraftSchema.safeParse(draft);
    expect(invalid.success).toBe(false);
    if (invalid.success) throw new Error('Invalid dialogue accepted');
    expect(invalid.error.issues.map(({ message }) => message)).toEqual([
      '矢印は発話順に1から指定してください。',
      '矢印や字幕切り替えに使う発話の合図を入力してください。',
    ]);
    expect(dialogueDraftSchema.safeParse(travelExpenseDialogue([10005, 10005])).success).toBe(
      false,
    );
  });

  it('computes shared cue time from VOICEVOX mora lengths, including pauses', () => {
    const timing = dialogueMoraStarts({
      speedScale: 1,
      prePhonemeLength: 0.1,
      outputStereo: false,
      accent_phrases: [
        {
          moras: [{ text: 'マ', consonant_length: 0.05, vowel_length: 0.1 }],
          pause_mora: { text: '、', consonant_length: null, vowel_length: 0.2 },
        },
        {
          moras: [
            { text: 'シャ', consonant_length: 0.05, vowel_length: 0.1 },
            { text: 'ナ', consonant_length: 0.05, vowel_length: 0.1 },
            { text: 'イ', consonant_length: null, vowel_length: 0.1 },
          ],
        },
      ],
    });
    expect(timing[normalizeDialogueCue('しゃない')]).toEqual({
      seconds: 42 / 93.75,
      source: 'aligned',
    });
    expect(timing['マシャ']).toBeUndefined();
    expect(normalizeDialogueCue('りょうしゅうしょお')).toBe('リョーシューショー');
  });

  it('registers one portrait for each owner and role, and reuses the original bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manaberu-dialogue-test-'));
    try {
      const alice = join(directory, 'alice');
      const bob = join(directory, 'bob');
      const [mentor, mentorAgain, junior, anotherOwner] = await Promise.all([
        dialoguePortrait(alice, 'mentor'),
        dialoguePortrait(alice, 'mentor'),
        dialoguePortrait(alice, 'junior'),
        dialoguePortrait(bob, 'mentor'),
      ]);
      expect(mentor.sha256).toBe(mentorAgain.sha256);
      expect([mentor.reused, mentorAgain.reused].sort()).toEqual([false, true]);
      expect(new Set([mentor.sha256, junior.sha256, anotherOwner.sha256]).size).toBe(3);
      expect((await dialoguePortrait(alice, 'mentor')).reused).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 35_000);
});
