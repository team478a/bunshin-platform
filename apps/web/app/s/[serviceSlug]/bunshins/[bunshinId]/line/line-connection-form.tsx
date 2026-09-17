'use client';

import { useState } from 'react';

export function LineConnectionForm({
  serviceSlug,
  bunshinId,
}: {
  serviceSlug: string;
  bunshinId: string;
}) {
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      id="line-connect-form"
      className="form-stack line-link-form"
      action="/auth/service-line/start"
      method="post"
      onSubmit={() => setSubmitting(true)}
    >
      <input type="hidden" name="serviceSlug" value={serviceSlug} />
      <input type="hidden" name="bunshinId" value={bunshinId} />
      <label className={`line-link-consent${consented ? ' is-checked' : ''}`}>
        <input
          type="checkbox"
          name="consent"
          value="yes"
          checked={consented}
          onChange={(event) => setConsented(event.target.checked)}
        />
        <span>このサービスのLINE通知を受け取ることに同意する</span>
      </label>
      {!consented && (
        <p className="line-link-form__guide">① 上の四角を押すと、青いボタンが使えます。</p>
      )}
      <button
        className="button button--primary button--full"
        type="submit"
        disabled={!consented || submitting}
      >
        {submitting ? 'LINEの本人確認を開いています…' : '本人確認してLINEを接続する'}
      </button>
      {submitting && (
        <p className="line-link-form__progress" role="status">
          画面が変わるまで、このページを閉じずにお待ちください。
        </p>
      )}
    </form>
  );
}
