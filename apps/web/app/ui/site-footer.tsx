'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { legalLinksForPathname } from './site-footer-links';

export function SiteFooter() {
  const links = legalLinksForPathname(usePathname());
  return (
    <footer className="site-footer">
      <Link href={{ pathname: links.terms }}>利用規約</Link>
      <Link href={{ pathname: links.privacy }}>プライバシー</Link>
    </footer>
  );
}
