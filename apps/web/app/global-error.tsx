'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          background: '#f7f5f0',
          color: '#14213d',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <main
          style={{ boxSizing: 'border-box', maxWidth: 560, margin: '0 auto', padding: '72px 24px' }}
        >
          <p style={{ color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em' }}>
            ワタシワークス
          </p>
          <h1 style={{ fontSize: 'clamp(1.8rem, 7vw, 2.6rem)', lineHeight: 1.35 }}>
            ページを表示できませんでした
          </h1>
          <p style={{ lineHeight: 1.8 }}>
            一時的な問題が発生しました。時間をおいて、もう一度お試しください。
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              width: '100%',
              border: 0,
              borderRadius: 12,
              padding: '14px 18px',
              background: '#0d6efd',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            もう一度読み込む
          </button>
        </main>
      </body>
    </html>
  );
}
