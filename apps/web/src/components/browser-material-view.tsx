import Image from 'next/image';
import Link from 'next/link';
import styles from './browser-material.module.css';

export const deviceLabel = (device: string) =>
  device === 'mobile' ? 'スマートフォンのブラウザ' : 'パソコンのブラウザ';
export const dateLabel = (date: Date) =>
  new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeZone: 'Asia/Tokyo' }).format(date);

export function BrowserMaterialView({
  material,
  device,
  ordinal,
  showDetail,
  stepHref,
  imageHref,
  guidance,
}: {
  material: {
    title: string;
    goal: string;
    preparation: string;
    practice: string;
    checkpoint: string;
    verifiedAt: Date;
    steps: { ordinal: number; instruction: string }[];
  };
  device: string;
  ordinal: number;
  showDetail: boolean;
  stepHref: (
    value: number,
  ) => string | { pathname: string; query: Record<string, string | number> };
  imageHref: (variant: 'before' | 'after' | 'detail') => string;
  guidance?: string;
}) {
  const step = material.steps[ordinal - 1];
  if (!step) return null;

  return (
    <>
      <header>
        <h2>{material.title}</h2>
        <p>{material.goal}</p>
        <small>
          {deviceLabel(device)} · 検証 {dateLabel(material.verifiedAt)}
        </small>
      </header>
      <details>
        <summary>準備</summary>
        <p>{material.preparation}</p>
      </details>
      <section className={styles.step} aria-labelledby="material-step">
        <h3 id="material-step">
          手順 {ordinal} / {material.steps.length}
        </h3>
        <p>{step.instruction}</p>
        <div className={styles.images}>
          {(['before', 'after'] as const).map((variant) => {
            const label = variant === 'before' ? '操作前' : '操作後';
            const href = imageHref(variant);
            return (
              <figure key={variant}>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  <Image src={href} alt={label + 'の画面'} width={640} height={480} unoptimized />
                </a>
                <figcaption>{label} · 画像を開いて拡大</figcaption>
              </figure>
            );
          })}
        </div>
        {showDetail && (
          <details className={styles.detail}>
            <summary>操作箇所を拡大</summary>
            <a href={imageHref('detail')} target="_blank" rel="noopener noreferrer">
              <Image
                src={imageHref('detail')}
                alt="操作箇所の拡大画像"
                width={480}
                height={260}
                unoptimized
              />
            </a>
          </details>
        )}
        <nav className={styles.navigation} aria-label="教材の手順">
          {ordinal > 1 ? <Link href={stepHref(ordinal - 1)}>前へ</Link> : <span />}
          {ordinal < material.steps.length && <Link href={stepHref(ordinal + 1)}>次へ</Link>}
        </nav>
      </section>
      {ordinal === material.steps.length && (
        <section className={styles.step}>
          <h3>実践課題</h3>
          <p>{material.practice}</p>
          {guidance && <p>{guidance}</p>}
          <h4>理解度確認</h4>
          <p>{material.checkpoint}</p>
        </section>
      )}
    </>
  );
}
