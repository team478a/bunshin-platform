import type { UrlObject } from 'node:url';
import Image from 'next/image';
import Link from 'next/link';
import { deviceLabel, materialSourceLabel } from './browser-material-view';
import { BrowserMaterialPrintButton } from './browser-material-print-button';
import styles from './browser-material-print.module.css';

type Variant = 'before' | 'after' | 'detail';
const figures = [
  ['before', '操作前'],
  ['after', '操作後'],
  ['detail', '操作箇所の拡大'],
] as const;

export function BrowserMaterialPrint({
  material,
  device,
  images,
  imageHref,
  backHref,
  reviewFailed,
}: {
  material: {
    title: string;
    goal: string;
    preparation: string;
    practice: string;
    checkpoint: string;
    verifiedAt: Date | null;
    revision: number;
    steps: readonly { ordinal: number; instruction: string }[];
  };
  device: string;
  images: readonly ({ ordinal: number } & Record<Variant, boolean>)[];
  imageHref: (ordinal: number, variant: Variant) => string;
  backHref: UrlObject;
  reviewFailed: boolean;
}) {
  const recorded = new Map(images.map((image) => [image.ordinal, image]));
  return (
    <main className={styles.document} id="browser-material-print">
      <div className={styles.controls}>
        <Link href={backHref}>教材に戻る</Link>
        <BrowserMaterialPrintButton />
      </div>
      <header className={styles.header}>
        <h1>{material.title}</h1>
        <p>{material.goal}</p>
        <small>
          {deviceLabel(device)} · {materialSourceLabel(material)} · 第{material.revision}版
        </small>
        {reviewFailed && <p>再検証で操作を確認できなかったため、前の教材を表示しています。</p>}
      </header>
      {material.preparation && (
        <section className={styles.section}>
          <h2>準備</h2>
          <p>{material.preparation}</p>
        </section>
      )}
      {material.steps.map((step) => (
        <section key={step.ordinal} className={styles.section}>
          <h2>手順 {step.ordinal}</h2>
          <p>{step.instruction}</p>
          <div className={styles.figures}>
            {figures.map(([variant, label]) =>
              recorded.get(step.ordinal)?.[variant] ? (
                <figure key={variant} className={variant === 'detail' ? styles.detail : undefined}>
                  <Image
                    src={imageHref(step.ordinal, variant)}
                    alt={label + 'の画面'}
                    width={640}
                    height={480}
                    loading="eager"
                    unoptimized
                  />
                  <figcaption>{label}</figcaption>
                </figure>
              ) : null,
            )}
          </div>
        </section>
      ))}
      <section className={styles.section}>
        <h2>実践課題</h2>
        <p>{material.practice}</p>
        <h2>理解度確認</h2>
        <p>{material.checkpoint}</p>
      </section>
    </main>
  );
}
