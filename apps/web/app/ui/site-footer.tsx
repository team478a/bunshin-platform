'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { legalLinksForPathname } from './site-footer-links';

export function SiteFooter() {
  const links = legalLinksForPathname(usePathname());
  return (
    <footer className="site-footer">
      <Link href={links.terms as Route}>利用規約</Link>
      <Link href={links.privacy as Route}>プライバシー</Link>
    </footer>
  );
}
