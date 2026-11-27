'use client';

import { useEffect, useState } from 'react';
import {
  blankDialogue,
  dialogueDraftSchema,
  dialogueRoles,
  travelExpenseDialogue,
  type DialogueDraft,
  type DialogueLine,
  type DialogueSummary,
  type DialogueVoice,
} from '../services/manaberu-dialogue-model';
import styles from './manaberu-dialogue-editor.module.css';

export function ManaberuDialogueEditor({
  endpoint,
  materialTitle,
  instruction,
}: {
  endpoint: string;
  materialTitle: string;
  instruction: string;
}) {
  const [draft, setDraft] = useState<DialogueDraft | null>(null);
  const [voices, setVoices] = useState<DialogueVoice[]>([]);
  const [summary, setSummary] = useState<DialogueSummary | null>(null);
  const [busy, setBusy] = useState<'save' | 'render' | null>(null);
  const [message, setMessage] = useState('');
  const [openVideo, setOpenVideo] = useState(false);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('教材を開けませんでした。');
        return response.json() as Promise<{
          draft: DialogueDraft | null;
          voices: DialogueVoice[];
          summary: DialogueSummary | null;
          hasUnrenderedChanges: boolean;
        }>;
      })
      .then((result) => {
        setVoices(result.voices);
        setDraft(
          result.draft ??
            blankDialogue(materialTitle, instruction, [
              result.voices[0]?.id ?? 0,
              result.voices[1]?.id ?? 1,
            ]),
        );
        setSummary(result.summary);
        setChanged(result.hasUnrenderedChanges);
        if (!result.voices.length)
          setMessage('VOICEVOXに接続できません。保存済みの試聴・動画は利用できます。');
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(error instanceof Error ? error.message : '教材を開けませんでした。');
      });
    return () => controller.abort();
  }, [endpoint, instruction, materialTitle]);

  function update(next: DialogueDraft) {
    setDraft(next);
    setChanged(true);
  }

  function updateLine(lineId: string, patch: Partial<DialogueLine>) {
    if (draft)
      update({
        ...draft,
        lines: draft.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
      });
  }

  async function submit(operation: 'save' | 'render') {
    if (!draft || busy) return;
    const valid = dialogueDraftSchema.safeParse(draft);
    if (!valid.success) {
      setMessage(
        valid.error.issues.find(({ code }) => code === 'custom')?.message ??
          '台詞、配役、図の項目を確認してください。',
      );
      return;
    }
    setBusy(operation);
    setMessage(operation === 'render' ? '音声と動画を準備しています。' : '保存しています。');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation, draft: valid.data }),
      });
      const result = (await response.json()) as { message?: string; summary?: DialogueSummary };
      if (!response.ok) throw new Error(result.message ?? '教材を準備できませんでした。');
      if (result.summary) {
        setSummary(result.summary);
        setChanged(false);
        setOpenVideo(false);
      }
      setMessage(
        operation === 'render'
          ? '二人の連続試聴と動画を用意しました。'
          : 'この手順に台本を保存しました。',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '教材を準備できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  const mediaUrl = (kind: 'audio' | 'mp4') =>
    endpoint +
    '&' +
    new URLSearchParams({ asset: kind, render: summary?.renderId ?? '' }).toString();

  return (
    <section className={styles.editor} aria-label="この手順の会話と図解">
      <h2>会話＋図解</h2>
      <p>この手順に、二人の会話と発話に合わせて動く矢印を追加できます。</p>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {draft && (
        <fieldset className={styles.form} disabled={busy !== null}>
          <legend>この手順の台本</legend>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() =>
                update(
                  travelExpenseDialogue([draft.roles.mentor.voiceId, draft.roles.junior.voiceId]),
                )
              }
            >
              交通費申請の例を入れる
            </button>
          </div>
          <label>
            会話教材のタイトル
            <input
              value={draft.title}
              maxLength={48}
              onChange={(e) => update({ ...draft, title: e.target.value })}
            />
          </label>
          <div className={styles.roles}>
            {dialogueRoles.map((role, index) => (
              <fieldset key={role}>
                <legend>{index === 0 ? '先輩（左）' : '新人（右）'}</legend>
                <label>
                  表示名
                  <input
                    value={draft.roles[role].name}
                    maxLength={18}
                    onChange={(e) =>
                      update({
                        ...draft,
                        roles: {
                          ...draft.roles,
                          [role]: { ...draft.roles[role], name: e.target.value },
                        },
                      })
                    }
                  />
                </label>
                <label>
                  VOICEVOXの声
                  <select
                    value={draft.roles[role].voiceId}
                    onChange={(e) =>
                      update({
                        ...draft,
                        roles: {
                          ...draft.roles,
                          [role]: { ...draft.roles[role], voiceId: Number(e.target.value) },
                        },
                      })
                    }
                  >
                    {!voices.some(({ id }) => id === draft.roles[role].voiceId) && (
                      <option value={draft.roles[role].voiceId}>
                        保存済みの声 {draft.roles[role].voiceId}
                      </option>
                    )}
                    {voices.map(({ id, name }) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            ))}
          </div>
          <div className={styles.diagram}>
            {draft.diagram.map((node, index) => (
              <label key={index}>
                図の項目 {index + 1}
                <input
                  value={node}
                  maxLength={28}
                  onChange={(e) =>
                    update({
                      ...draft,
                      diagram: draft.diagram.map((item, position) =>
                        position === index ? e.target.value : item,
                      ) as DialogueDraft['diagram'],
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p className={styles.help}>
            台詞に全角の「｜」を入れると、後半の字幕が発話の合図で切り替わります。
          </p>
          {draft.lines.map((line, index) => (
            <fieldset key={line.id} className={styles.line}>
              <legend>台詞 {index + 1}</legend>
              <div className={styles.roles}>
                <label>
                  配役
                  <select
                    value={line.role}
                    onChange={(e) =>
                      updateLine(line.id, {
                        role: e.target.value === 'mentor' ? 'mentor' : 'junior',
                      })
                    }
                  >
                    {dialogueRoles.map((role) => (
                      <option key={role} value={role}>
                        {draft.roles[role].name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  台詞後の間（秒）
                  <input
                    type="number"
                    min=".12"
                    max="2"
                    step=".01"
                    value={line.pause}
                    onChange={(e) => updateLine(line.id, { pause: e.target.valueAsNumber })}
                  />
                </label>
              </div>
              <label>
                台詞
                <textarea
                  rows={2}
                  value={line.text}
                  maxLength={120}
                  onChange={(e) => updateLine(line.id, { text: e.target.value })}
                />
              </label>
              <label>
                読み（任意）
                <input
                  value={line.reading}
                  maxLength={140}
                  onChange={(e) => updateLine(line.id, { reading: e.target.value })}
                />
              </label>
              <div className={styles.roles}>
                <label>
                  動かす矢印
                  <select
                    value={line.arrow}
                    onChange={(e) =>
                      updateLine(line.id, {
                        arrow: Number(e.target.value) as DialogueLine['arrow'],
                      })
                    }
                  >
                    <option value={0}>動かさない</option>
                    {draft.diagram.map((node, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1} · {node}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  発話の合図（読みの一部）
                  <input
                    value={line.cue}
                    maxLength={24}
                    onChange={(e) => updateLine(line.id, { cue: e.target.value })}
                  />
                </label>
              </div>
              {draft.lines.length > 2 && (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() =>
                    update({ ...draft, lines: draft.lines.filter(({ id }) => id !== line.id) })
                  }
                >
                  台詞 {index + 1} を削除
                </button>
              )}
            </fieldset>
          ))}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              disabled={draft.lines.length >= 8}
              onClick={() =>
                update({
                  ...draft,
                  lines: [
                    ...draft.lines,
                    {
                      id: crypto.randomUUID(),
                      role: 'junior',
                      text: '',
                      reading: '',
                      pause: 0.35,
                      arrow: 0,
                      cue: '',
                    },
                  ],
                })
              }
            >
              台詞を追加
            </button>
            <button type="button" className={styles.secondary} onClick={() => void submit('save')}>
              台本を保存
            </button>
            <button type="button" disabled={!voices.length} onClick={() => void submit('render')}>
              {summary ? '変更を反映して連続試聴を作る' : '二人の連続試聴を作る'}
            </button>
          </div>
        </fieldset>
      )}
      {summary && (
        <div className={styles.results}>
          <h3>二人の連続試聴</h3>
          {changed && <p>以下は前回の出力です。変更を反映すると更新されます。</p>}
          <audio aria-label="二人の連続試聴" controls preload="metadata" src={mediaUrl('audio')} />
          <p>
            音声は{summary.audioGenerated.length}件を生成、{summary.audioReused.length}
            件を再利用。映像カットは{summary.clipsGenerated.length}件を生成、
            {summary.clipsReused.length}件を再利用。
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setOpenVideo(true)}>
              縦型MP4を開く
            </button>
            <a href={mediaUrl('mp4')} download="manaberu-dialogue.mp4">
              MP4を保存
            </a>
          </div>
          {openVideo && (
            <video
              aria-label="会話と図解の縦型動画"
              controls
              playsInline
              preload="metadata"
              src={mediaUrl('mp4')}
            />
          )}
        </div>
      )}
    </section>
  );
}
