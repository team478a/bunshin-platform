import type { Metadata } from 'next';
import Link from 'next/link';
import './styles.css';

export const metadata: Metadata = {
  title: 'ワタシワークス',
  applicationName: 'ワタシワークス',
  description: 'あなた専用のAI分身と、毎日の発信を進める企画サービス',
  icons: {
    icon: '/watashiworks-icon.jpg',
    apple: '/watashiworks-icon.jpg',
  },
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
