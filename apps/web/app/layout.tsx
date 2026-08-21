import type { Metadata } from 'next';
import Link from 'next/link';
import './styles.css';

export const metadata: Metadata = {
  title: 'BUNSHIN Platform',
  description: 'BUNSHIN Platform foundation status',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        {children}
        <footer className="site-footer">
          <Link href="/terms">利用規約</Link>
          <Link href="/privacy">プライバシー</Link>
        </footer>
      </body>
    </html>
  );
}
