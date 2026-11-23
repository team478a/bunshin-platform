'use client';

import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

const sections = [
  { id: 'overview', label: '概要' },
  { id: 'cards', label: 'カード' },
  { id: 'design', label: '表示・案内役' },
  { id: 'setup', label: '公開・設定' },
  { id: 'sales', label: '販売・紹介' },
  { id: 'quality', label: '運用データ' },
] as const;

type Section = (typeof sections)[number]['id'];
const ActiveSection = createContext<Section>('overview');

export function FortuneAdminLayout({
  initialSection,
  configured,
  cardsReady,
  children,
}: {
  initialSection: string | undefined;
  configured: boolean;
  cardsReady: boolean;
  children: ReactNode;
}) {
  const available = sections.filter(({ id }) =>
    id === 'cards' ? cardsReady : configured || id === 'overview' || id === 'setup',
  );
  const [selected, setSelected] = useState<Section>(
    () => available.find(({ id }) => id === initialSection)?.id ?? 'overview',
  );
  const layout = useRef<HTMLDivElement>(null);
  const current = available.some(({ id }) => id === selected) ? selected : 'overview';

  function openSection(id: Section) {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.delete('commerce');
    url.searchParams.delete('creditExchange');
    url.searchParams.set('section', id);
    url.hash = '';
    window.history.replaceState(null, '', url);
    if (layout.current && layout.current.getBoundingClientRect().top < 0) {
      layout.current.scrollIntoView({ block: 'start' });
    }
  }

  return (
    <div className="fortune-admin__layout" ref={layout}>
      <nav className="fortune-admin__nav" aria-label="占い管理メニュー">
        {available.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-controls={`fortune-admin-${id}`}
            aria-pressed={current === id}
            onClick={() => openSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="fortune-admin__content">
        <ActiveSection.Provider value={current}>{children}</ActiveSection.Provider>
      </div>
    </div>
  );
}

export function FortuneAdminPanel({ id, children }: { id: Section; children: ReactNode }) {
  const active = useContext(ActiveSection);
  return (
    <div id={`fortune-admin-${id}`} className="fortune-admin__panel" hidden={active !== id}>
      {children}
    </div>
  );
}
