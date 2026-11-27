export function InstructorReviewReply({
  id,
  title,
  focus,
  excerpt,
  sharedVersion,
  reply,
  action,
}: {
  id: string;
  title: string;
  focus: string;
  excerpt: string;
  sharedVersion: number;
  reply: string | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <article className="settings-card">
      <h2>{title}</h2>
      <p>依頼時の課題版 {sharedVersion}</p>
      <h3>見てほしい箇所</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{focus}</p>
      <h3>受講者が共有した下書き・抜粋</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{excerpt}</p>
      {reply ? (
        <>
          <h3>送信済みの回答</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{reply}</p>
        </>
      ) : (
        <form action={action} className="form-stack">
          <input type="hidden" name="reviewId" value={id} />
          <label className="field">
            <span>受講者への回答</span>
            <textarea name="answer" rows={8} maxLength={8000} required />
          </label>
          <p>できている点、直すとよい点、本人が試す次の一歩を伝えてください。</p>
          <button type="submit" className="button button--primary">
            回答を送る
          </button>
        </form>
      )}
    </article>
  );
}
