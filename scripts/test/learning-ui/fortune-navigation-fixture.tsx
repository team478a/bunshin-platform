import type { ComponentProps } from 'react';

export default function Link(props: ComponentProps<'a'>) {
  return <a {...props} />;
}

export function useRouter() {
  return {
    refresh: () => window.dispatchEvent(new Event('fortune-fixture-refresh')),
    push: () => window.dispatchEvent(new Event('fortune-fixture-refresh')),
  };
}
