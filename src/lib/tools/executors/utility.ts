import { browser } from '#imports';
import { normalizeSite } from '../../sites';
import type { ToolExecResult } from '../registry';

function text(value: string, isError = false): ToolExecResult {
  return { content: [{ type: 'text', text: value }], isError: isError || undefined };
}

export async function executeWait(input: Record<string, unknown>): Promise<ToolExecResult> {
  const requested = Number(input.seconds ?? 2);
  const seconds = Math.min(10, Math.max(0.5, Number.isFinite(requested) ? requested : 2));
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  return text(`Waited ${seconds}s.`);
}

/**
 * Runs only after the user approved the plan card (propose_plan is in
 * ACTING_TOOLS) — the site grant itself happens in the approval flow; this
 * just confirms to the model.
 */
export async function executeProposePlan(input: Record<string, unknown>): Promise<ToolExecResult> {
  const sites = (Array.isArray(input.sites) ? input.sites : [])
    .map((s) => (typeof s === 'string' ? normalizeSite(s) : null))
    .filter((s): s is string => !!s);
  if (sites.length === 0) {
    return text('propose_plan requires "sites": the hostnames you will act on.', true);
  }
  return text(
    `Plan approved. Actions on ${sites.join(', ')} will run without individual approval for the ` +
      'rest of this conversation. Proceed with the plan now — do not ask for permission again.',
  );
}

export async function executeListTabs(): Promise<ToolExecResult> {
  const tabs = await browser.tabs.query({ currentWindow: true });
  const lines = tabs.map((tab) => {
    const marker = tab.active ? ' (active)' : '';
    return `- "${(tab.title ?? 'Untitled').slice(0, 80)}"${marker} — ${tab.url ?? 'about:blank'}`;
  });
  return text(`Open tabs in this window (${tabs.length}):\n${lines.join('\n')}`);
}
