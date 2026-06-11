import { useEffect, useRef, useState } from 'react';
import { browser } from '#imports';
import { runAgent } from '../lib/agent/loop';
import { buildSystemPrompt } from '../lib/constants';
import { logEvent } from '../lib/debug-log';
import { appendMessage, createConversation, getMessages } from '../lib/db/repo';
import { shrinkImagesForStorage } from '../lib/image';
import { createProvider, supportsTools, supportsVision } from '../lib/providers';
import { describeProviderError } from '../lib/providers/errors';
import type { ChatMessage, ToolUsePart } from '../lib/providers/types';
import { addAutoApproveOrigin, getSettings, type Settings } from '../lib/settings/storage';
import { normalizeSite } from '../lib/sites';
import {
  ACTING_TOOLS,
  DEBUGGER_TOOLS,
  PLAN_MODE_TOOLS,
  SEQUENTIAL_TOOLS,
  toolDefinitions,
} from '../lib/tools/definitions';
import { toolRegistry } from '../lib/tools/registry';
import type { ApprovalDecision, PendingApproval } from './ApprovalCard';

// All agent orchestration for the chat surface: running the loop, approval
// promise plumbing (including plan-mode site grants), live streaming state,
// and error normalization. Chat.tsx stays a pure view over this.

export interface LiveState {
  streamText: string;
  /** Tools currently executing — several can run in parallel. */
  toolNames: string[];
  /** Transient status, e.g. "Rate limited — retrying in 8s…". */
  notice: string | null;
}

const IDLE_LIVE: LiveState = { streamText: '', toolNames: [], notice: null };

async function getActiveTabOrigin(): Promise<string | null> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return null;
    const url = new URL(tab.url);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'AbortError' ||
    err.name === 'APIUserAbortError' ||
    err.message.toLowerCase().includes('abort')
  );
}

export function useAgent(options: {
  settings: Settings;
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
}) {
  const { settings, conversationId, onConversationCreated } = options;

  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<LiveState>(IDLE_LIVE);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Plan mode: sites granted by an approved propose_plan. Scoped to the
  // conversation — switching or starting a new chat clears the grants.
  const grantedSitesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    grantedSitesRef.current = new Set();
  }, [conversationId]);

  /** The site an acting tool targets: explicit URL input, else the active tab. */
  async function targetSite(part: ToolUsePart): Promise<string | null> {
    if (typeof part.input.url === 'string') {
      const site = normalizeSite(part.input.url);
      if (site) return site;
    }
    const origin = await getActiveTabOrigin();
    return origin ? normalizeSite(origin) : null;
  }

  async function requestApproval(part: ToolUsePart): Promise<boolean> {
    const origin = await getActiveTabOrigin();

    // Read settings fresh — the prop can be stale mid-run.
    const current = await getSettings();
    if (origin && current.autoApproveOrigins.includes(origin)) return true;

    // An approved plan covers this site for the rest of the conversation.
    const site = part.name === 'propose_plan' ? null : await targetSite(part);
    if (current.planMode && site && grantedSitesRef.current.has(site)) return true;

    const decision = await new Promise<ApprovalDecision>((resolve) => {
      setPendingApproval({
        toolUseId: part.id,
        name: part.name,
        input: part.input,
        host: origin ? new URL(origin).host : null,
        resolve,
      });
    });
    setPendingApproval(null);
    logEvent('approval', `${part.name} ${decision.approved ? 'approved' : 'denied'}`);

    if (decision.approved && part.name === 'propose_plan' && Array.isArray(part.input.sites)) {
      for (const raw of part.input.sites) {
        const granted = typeof raw === 'string' ? normalizeSite(raw) : null;
        if (granted) grantedSitesRef.current.add(granted);
      }
    }
    if (decision.approved && decision.rememberOrigin && origin) {
      await addAutoApproveOrigin(origin);
    }
    return decision.approved;
  }

  async function send(text: string) {
    if (running || !text.trim()) return;
    setError(null);
    setRunning(true);
    setLive(IDLE_LIVE);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const convId = conversationId ?? (await createConversation());
      if (!conversationId) onConversationCreated(convId);

      const rows = await getMessages(convId);
      const history: ChatMessage[] = rows.map((r) => ({ role: r.role, parts: r.parts }));

      const userMessage: ChatMessage = { role: 'user', parts: [{ type: 'text', text }] };
      await appendMessage(convId, userMessage);
      history.push(userMessage);

      const provider = createProvider(settings);
      // Deep inspection rides on chrome.debugger — not offered on Firefox.
      const available = toolDefinitions.filter(
        (t) =>
          (!import.meta.env.FIREFOX || !DEBUGGER_TOOLS.has(t.name)) &&
          (supportsVision(settings) || t.name !== 'screenshot') &&
          (settings.planMode || !PLAN_MODE_TOOLS.has(t.name)),
      );
      const tools = supportsTools(settings) ? available : [];

      await runAgent({
        provider,
        model: settings.model,
        history,
        tools,
        system: buildSystemPrompt({ planMode: settings.planMode }),
        registry: toolRegistry,
        actingTools: ACTING_TOOLS,
        sequentialTools: SEQUENTIAL_TOOLS,
        signal: controller.signal,
        callbacks: {
          requestApproval,
          onTextDelta: (delta) => setLive((s) => ({ ...s, streamText: s.streamText + delta })),
          onAssistantMessage: async (message) => {
            await appendMessage(convId, message);
            setLive((s) => ({ ...s, streamText: '', toolNames: [] }));
          },
          onToolStart: (part) => setLive((s) => ({ ...s, toolNames: [...s.toolNames, part.name] })),
          onToolMessage: async (message) => {
            await appendMessage(convId, await shrinkImagesForStorage(message));
            setLive((s) => ({ ...s, toolNames: [] }));
          },
          onNotice: (notice) => setLive((s) => ({ ...s, notice })),
        },
      });
    } catch (err) {
      if (!isAbortError(err)) {
        logEvent('error', err instanceof Error ? err.message.slice(0, 300) : String(err));
        setError(describeProviderError(err));
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      setLive(IDLE_LIVE);
      setPendingApproval(null);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return { running, live, error, pendingApproval, send, stop };
}
