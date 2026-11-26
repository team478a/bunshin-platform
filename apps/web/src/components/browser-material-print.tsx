import Image from 'next/image';
import Link from 'next/link';
import { deviceLabel, materialSourceLabel } from './browser-material-view';
import { BrowserMaterialPrintButton } from './browser-material-print-button';
import styles from './browser-material-print.module.css';

type Variant = 'before' | 'after' | 'detail';
const variants: readonly Variant[] = ['before', 'after', 'detail'];
const figureLabels: Record<Variant, string> = {
  before: '操作前',
  after: '操作後',
  detail: '操作箇所の拡大',
};

const manualStyles = [
  { id: 'guide', label: '詳しい手順書', purpose: '初めて操作を覚える', figures: variants },
  { id: 'quick', label: '操作早見表', purpose: '作業中に手順を見返す', figures: [] },
  {
    id: 'compare',
    label: '画面比較',
    purpose: '操作前後の画面を照らし合わせる',
    figures: ['before', 'after'],
  },
  { id: 'practice', label: '実践ワークシート', purpose: '自分で試して振り返る', figures: [] },
] as const;

type MaterialHref = { pathname: string; query: { topicId?: string } };

export function BrowserMaterialManualLinks({
  materialHref,
  selectedFormat,
}: {
  materialHref: MaterialHref;
  selectedFormat?: (typeof manualStyles)[number]['id'];
}) {
  return (
    <nav aria-label="PDFマニュアルの形式" className={styles.picker}>
      {manualStyles.map(({ id, label, purpose }) => (
        <Link
          key={id}
          prefetch={false}
          href={{ ...materialHref, query: { ...materialHref.query, print: '1', format: id } }}
          aria-current={selectedFormat === id ? 'page' : undefined}
        >
          <strong>{purpose}</strong>
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function BrowserMaterialPrint({
  material,
  device,
  images,
  imageHref,
  backHref,
  webMaterialUrl,
  reviewFailed,
  requestedStyle,
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
  backHref: MaterialHref;
  webMaterialUrl: string;
  reviewFailed: boolean;
  requestedStyle: string | string[] | undefined;
}) {
  const selected = manualStyles.find(({ id }) => id === requestedStyle) ?? manualStyles[0];
  const recorded = new Map(images.map((image) => [image.ordinal, image]));
  const compact = selected.id === 'quick' || selected.id === 'practice';

  return (
    <main className={styles.document} id="browser-material-print">
      <div className={styles.controls}>
        <Link href={backHref}>教材に戻る</Link>
        <BrowserMaterialPrintButton />
      </div>
      <BrowserMaterialManualLinks materialHref={backHref} selectedFormat={selected.id} />
      <header className={styles.header}>
        <span className={styles.format}>{selected.label}</span>
        <h1>{material.title}</h1>
        <p>{material.goal}</p>
        <small>
          {deviceLabel(device)} · {materialSourceLabel(material)} · 第{material.revision}版 ·{' '}
          <a href={webMaterialUrl}>Web教材で最新版を確認する</a>（要ログイン）
        </small>
        {reviewFailed && <p>再検証で操作を確認できなかったため、前の教材を表示しています。</p>}
      </header>
      {material.preparation && (
        <section className={styles.section}>
          <h2>準備</h2>
          <p>{material.preparation}</p>
        </section>
      )}
      {compact ? (
        <section className={styles.section}>
          <h2>{selected.id === 'practice' ? '操作チェックリスト' : '操作の順番'}</h2>
          <ol className={styles.steps}>
            {material.steps.map((step) => (
              <li key={step.ordinal} value={step.ordinal}>
                {selected.id === 'practice' && <span className={styles.check} aria-hidden="true" />}
                {step.instruction}
              </li>
            ))}
          </ol>
        </section>
      ) : (
        material.steps.map((step) => {
          const available = selected.figures.filter(
            (variant) => recorded.get(step.ordinal)?.[variant],
          );
          return (
            <section key={step.ordinal} className={styles.section}>
              <h2>手順 {step.ordinal}</h2>
              <p>{step.instruction}</p>
              {available.length > 0 ? (
                <div className={styles.figures}>
                  {available.map((variant) => (
                    <figure
                      key={variant}
                      className={variant === 'detail' ? styles.detail : undefined}
                    >
                      <Image
                        src={imageHref(step.ordinal, variant)}
                        alt={figureLabels[variant] + 'の画面'}
                        width={640}
                        height={480}
                        loading="eager"
                        unoptimized
                      />
                      <figcaption>{figureLabels[variant]}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                selected.id === 'compare' && <p>この手順には操作前後の画像がありません。</p>
              )}
            </section>
          );
        })
      )}
      <section className={styles.section}>
        {selected.id !== 'quick' && (
          <>
            <h2>実践課題</h2>
            <p>{material.practice}</p>
          </>
        )}
        <h2>{selected.id === 'quick' ? '完了の確認' : '理解度確認'}</h2>
        <p>{material.checkpoint}</p>
      </section>
      {selected.id === 'practice' && (
        <section className={styles.section}>
          <h2>振り返り</h2>
          <p>できたこと、つまずいた手順番号、次に試したいことを記録しましょう。</p>
          <div className={styles.notes} aria-hidden="true">
            <div />
            <div />
            <div />
          </div>
        </section>
      )}
    </main>
  );
}
