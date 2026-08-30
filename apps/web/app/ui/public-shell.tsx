import Link from 'next/link';
import { BrandMark } from './brand-mark';

export function PublicShell({
  children,
  narrow = false,
  showPlatformBrand = true,
}: {
  children: React.ReactNode;
  narrow?: boolean;
  showPlatformBrand?: boolean;
}) {
  return (
    <main className="public-shell">
      <div className={`public-shell__content${narrow ? ' public-shell__content--narrow' : ''}`}>
        {showPlatformBrand && (
          <header className="public-shell__brand">
            <Link href="/" className="brand-link">
              <BrandMark />
            </Link>
          </header>
        )}
        {children}
      </div>
    </main>
  );
}
