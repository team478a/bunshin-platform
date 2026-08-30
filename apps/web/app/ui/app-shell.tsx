'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from './brand-mark';

const navigation = [
  { href: '/bunshins', label: 'ホーム', icon: 'home' },
  { href: '/badges', label: 'バッジ', icon: 'badge' },
  { href: '/knowledge', label: '知識', icon: 'knowledge' },
  { href: '/account', label: 'アカウント', icon: 'account' },
] as const;

const adminNavigation = [
  { href: '/admin', label: '運用設定' },
  { href: '/admin/alerts', label: '運用通知' },
  { href: '/admin/connections', label: 'APIキーと接続確認' },
  { href: '/admin/users', label: 'ユーザーと利用状況' },
  { href: '/admin/reports', label: '運用レポート' },
  { href: '/admin/audits', label: '変更履歴' },
  { href: '/admin/support', label: '問い合わせ対応' },
  { href: '/admin/access', label: '管理者と権限' },
  { href: '/admin/groups', label: 'グループ管理' },
  { href: '/admin/services', label: 'サービス管理' },
  { href: '/admin/badges', label: 'グループバッジ確認' },
  { href: '/admin/badges/rewards', label: 'バッジ特典運用' },
  { href: '/admin/trends', label: 'トレンド企画' },
  { href: '/admin/videos', label: '動画生成の状況' },
  { href: '/admin/images', label: '画像生成の試験運用' },
  { href: '/admin/activity-rules', label: '続けやすさのルール' },
  { href: '/admin/line', label: 'LINE運用' },
  { href: '/admin/legal', label: '法務文書' },
  { href: '/admin/deletions', label: '退会要求' },
] as const;

export function isNavigationItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationIcon({ name }: { name: (typeof navigation)[number]['icon'] }) {
  if (name === 'home') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (name === 'knowledge') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4.5A3.5 3.5 0 0 1 8.5 8H11v12H8.5A3.5 3.5 0 0 0 5 23V4.5Zm14 0A3.5 3.5 0 0 0 15.5 8H13v12h2.5A3.5 3.5 0 0 1 19 23V4.5Z" />
      </svg>
    );
  }
  if (name === 'badge') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');

  return (
    <div className={`app-shell${isAdmin ? ' app-shell--admin' : ''}`}>
      <header className="app-header">
        <Link href="/bunshins" className="brand-link" aria-label="ワタシワークス ホーム">
          <BrandMark />
        </Link>
        {isAdmin ? (
          <span className="app-header__context">管理画面</span>
        ) : (
          <Link href="/account" className="app-header__account" aria-label="アカウント設定">
            <NavigationIcon name="account" />
          </Link>
        )}
      </header>
      {isAdmin ? (
        <div className="admin-layout">
          <aside className="admin-sidebar">
            <div className="admin-sidebar__heading">
              <strong>運用管理</strong>
              <span>管理者専用</span>
            </div>
            <nav aria-label="管理画面ナビゲーション">
              {adminNavigation.map((item) => {
                const active = isNavigationItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={active ? 'is-active' : ''}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <Link className="admin-sidebar__back" href="/bunshins">
              ← ユーザー画面へ戻る
            </Link>
          </aside>
          <div className="admin-content">{children}</div>
        </div>
      ) : (
        <div className="app-shell__content">{children}</div>
      )}
      {!isAdmin && (
        <nav className="bottom-navigation" aria-label="メインナビゲーション">
          <div className="bottom-navigation__inner">
            {navigation.map((item) => {
              const active = isNavigationItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`bottom-navigation__item${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <NavigationIcon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
