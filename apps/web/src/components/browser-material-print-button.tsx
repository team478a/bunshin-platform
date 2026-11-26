'use client';

import { useState } from 'react';

export function BrowserMaterialPrintButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function printMaterial() {
    setFailed(false);
    setPending(true);
    try {
      const images = document.querySelectorAll<HTMLImageElement>('#browser-material-print img');
      await Promise.all(Array.from(images, (image) => image.decode()));
      window.print();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => void printMaterial()} disabled={pending}>
        {pending ? '画像を読み込み中…' : '印刷・PDFとして保存'}
      </button>
      {failed && <p role="alert">画像を読み込めませんでした。ページを再読み込みしてください。</p>}
    </>
  );
}
