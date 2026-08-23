import Link from 'next/link';
import { BrandMark } from './brand-mark';

export function PublicShell({
  children,
  narrow = false,
}: {
  children: React.ReactNode;
  narrow?: boolean;
}) {
  return (
    <main className="public-shell">
      <div className={`public-shell__content${narrow ? ' public-shell__content--narrow' : ''}`}>
        <header className="public-shell__brand">
          <Link href="/" className="brand-link">
            <BrandMark />
          </Link>
        </header>
        {children}
      </div>
    </main>
  );
}
