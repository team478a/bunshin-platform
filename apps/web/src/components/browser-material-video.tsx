export function BrowserMaterialVideo({
  state,
  requestVideo,
  fileHref,
  reloadHref,
}: {
  state: { ready: boolean; status: string | null } | null;
  requestVideo: () => Promise<void>;
  fileHref: (variant: 'mp4' | 'captions' | 'chapters') => string;
  reloadHref: string;
}) {
  if (!state) return null;
  return (
    <section aria-label="動画教材">
      <h2>動画教材</h2>
      {state.ready ? (
        <>
          <video
            controls
            playsInline
            preload="metadata"
            src={fileHref('mp4')}
            style={{ width: '100%', maxHeight: '70vh' }}
          >
            <track src={fileHref('captions')} kind="captions" srcLang="ja" label="日本語" default />
            <track src={fileHref('chapters')} kind="chapters" srcLang="ja" label="手順" />
          </video>
          <p>
            <a href={fileHref('mp4')} download="lesson.mp4">
              MP4 を保存する
            </a>
          </p>
        </>
      ) : !state.status || ['DEAD', 'CANCELLED'].includes(state.status) ? (
        <form action={requestVideo}>
          {state.status && <p role="status">動画を準備できませんでした。再試行できます。</p>}
          <button type="submit">
            {state.status ? '動画の生成を再試行する' : 'この教材を動画にする'}
          </button>
        </form>
      ) : (
        <div>
          <p role="status">動画教材を準備中です。</p>
          <a href={reloadHref}>準備状況を確認する</a>
        </div>
      )}
    </section>
  );
}
