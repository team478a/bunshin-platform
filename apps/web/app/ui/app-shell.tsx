'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from './brand-mark';

const navigation = [
  { href: '/bunshins', label: 'ホーム', icon: 'home' },
  { href: '/knowledge', label: '知識', icon: 'knowledge' },
  { href: '/account', label: 'アカウント', icon: 'account' },
] as const;

const adminNavigation = [
  { href: '/admin', label: '運用設定' },
  { href: '/admin/users', label: 'ユーザーと利用状況' },
  { href: '/admin/trends', label: 'トレンド企画' },
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
        <Link href="/bunshins" className="brand-link" aria-label="BUNSHIN ホーム">
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
