import type { Metadata } from 'next';
import './styles.css';
import { SiteFooter } from './ui/site-footer';

export const metadata: Metadata = {
  title: 'ワタシワークス',
  applicationName: 'ワタシワークス',
  description: 'あなた専用のAI投稿パートナーと、毎日の発信を進める企画サービス',
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
        <SiteFooter />
      </body>
    </html>
  );
}
