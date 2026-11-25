import type { CDPSession } from 'playwright';
import type { BrowserPlan } from '@bunshin/capability-browser';

type Click = Extract<BrowserPlan['steps'][number], { action: 'click' }>;

export async function observedClickTargets(session: CDPSession, ordinal: number): Promise<Click[]> {
  const { nodes } = await session.send('Accessibility.getFullAXTree', { depth: 12 });
  const clicks: Click[] = [];
  const names = new Set<string>();
  for (const node of nodes) {
    const role: unknown = node.role?.value;
    const name: unknown = node.name?.value;
    if (
      node.ignored ||
      (role !== 'button' && role !== 'link') ||
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 120
    )
      continue;
    const key = JSON.stringify([role, name]);
    if (names.has(key)) continue;
    names.add(key);
    clicks.push({
      id: 'observed-' + ordinal + '-' + clicks.length,
      action: 'click',
      target: { by: 'role', role, name },
    });
    if (clicks.length === 60) break;
  }
  return clicks;
}
