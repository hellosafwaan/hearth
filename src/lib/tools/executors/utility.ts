import { browser } from '#imports';
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

export async function executeListTabs(): Promise<ToolExecResult> {
  const tabs = await browser.tabs.query({ currentWindow: true });
  const lines = tabs.map((tab) => {
    const marker = tab.active ? ' (active)' : '';
    return `- "${(tab.title ?? 'Untitled').slice(0, 80)}"${marker} — ${tab.url ?? 'about:blank'}`;
  });
  return text(`Open tabs in this window (${tabs.length}):\n${lines.join('\n')}`);
}
