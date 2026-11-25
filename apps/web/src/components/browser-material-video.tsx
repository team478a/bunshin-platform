import { browserMaterialMeiVoice, browserMaterialVideoVersion } from '@bunshin/capability-browser';

export function BrowserMaterialVideo({
  state,
  requestVideo,
  fileHref,
  reloadHref,
}: {
  state: { version: number | null; status: string | null } | null;
  requestVideo: () => Promise<void>;
  fileHref: (variant: 'mp4' | 'captions' | 'chapters', version: number) => string;
  reloadHref: string;
}) {
  if (!state) return null;
  const version = state.version;
  return (
    <section aria-label="動画教材">
      <h2>動画教材</h2>
      {version === browserMaterialVideoVersion && (
        <p>
          音声合成{' '}
          <a href={browserMaterialMeiVoice.source}>
            {browserMaterialMeiVoice.name}（{browserMaterialMeiVoice.license}）
          </a>
          {' · '}
          {browserMaterialMeiVoice.attribution}
        </p>
      )}
      {version === 2 && (
        <p>
          音声合成{' '}
          <a href="https://open-jtalk.sourceforge.net/readme_hts_voice_nitech_jp_atr503_m001.php">
            HTS Voice NIT ATR503 M001（CC BY 3.0）
          </a>
        </p>
      )}
      {version && (
        <>
          <video
            controls
            playsInline
            preload="metadata"
            src={fileHref('mp4', version)}
            style={{ width: '100%', maxHeight: '70vh' }}
          >
            <track
              src={fileHref('captions', version)}
              kind="captions"
              srcLang="ja"
              label="日本語"
              default
            />
            <track src={fileHref('chapters', version)} kind="chapters" srcLang="ja" label="手順" />
          </video>
          <p>
            <a href={fileHref('mp4', version)} download="lesson.mp4">
              MP4 を保存する
            </a>
          </p>
        </>
      )}
      {version !== browserMaterialVideoVersion &&
        (!state.status || ['DEAD', 'CANCELLED'].includes(state.status) ? (
          <form action={requestVideo}>
            {state.status && <p role="status">動画を準備できませんでした。再試行できます。</p>}
            <button type="submit">
              {state.status
                ? '動画の生成を再試行する'
                : version
                  ? '女性ナレーション付き動画を作る'
                  : 'この教材を動画にする'}
            </button>
          </form>
        ) : (
          <div>
            <p role="status">動画教材を準備中です。</p>
            <a href={reloadHref}>準備状況を確認する</a>
          </div>
        ))}
    </section>
  );
}
