import type { CDPSession } from 'playwright';
import type { BrowserPlan } from '@bunshin/capability-browser';

export type ObservedAction = Extract<BrowserPlan['steps'][number], { action: 'click' | 'fill' }>;

export async function observedTargets(
  session: CDPSession,
  ordinal: number,
  sample?: string,
): Promise<ObservedAction[]> {
  const { nodes } = await session.send('Accessibility.getFullAXTree', { depth: 12 });
  const actions: ObservedAction[] = [];
  const names = new Set<string>();
  for (const node of nodes) {
    const role: unknown = node.role?.value;
    const name: unknown = node.name?.value;
    if (
      node.ignored ||
      (role !== 'button' &&
        role !== 'link' &&
        !(sample && (role === 'textbox' || role === 'checkbox'))) ||
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 120
    )
      continue;
    const key = JSON.stringify([role, name]);
    if (names.has(key)) continue;
    names.add(key);
    const id = 'observed-' + ordinal + '-' + actions.length;
    const target = { by: 'role', role, name } as const;
    if (role === 'textbox' && sample) actions.push({ id, action: 'fill', target, sample });
    else actions.push({ id, action: 'click', target });
    if (actions.length === 60) break;
  }
  return actions;
}
