import { useEffect, useRef, useState } from 'react';
import { APP_NAME, GEMINI_MODELS, MODELS } from '../lib/constants';
import { exportAllData, importData } from '../lib/db/export';
import {
  hasDebuggerPermission,
  hasPageAccess,
  requestDebuggerPermission,
  requestPageAccess,
  requestServerAccess,
  revokeDebuggerPermission,
  revokePageAccess,
  watchPermissions,
} from '../lib/permissions';
import { createProvider } from '../lib/providers';
import { listOpenAICompatibleModels } from '../lib/providers/openai-compatible';
import {
  removeAutoApproveOrigin,
  setSettings,
  type ProviderKind,
  type Settings,
} from '../lib/settings/storage';
import { Banner, Button, Card, Field, Input, Select, Toggle } from './ui';

type TestStatus = { state: 'idle' } | { state: 'testing' } | { state: 'ok' } | { state: 'error'; message: string };

const BASE_URL_PRESETS = [
  { label: 'LM Studio', url: 'http://localhost:1234/v1' },
  { label: 'Ollama', url: 'http://localhost:11434/v1' },
];

export function SettingsPanel(props: { settings: Settings; onDone?: () => void }) {
  const [draft, setDraft] = useState<Settings>(props.settings);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestStatus>({ state: 'idle' });
  const [saved, setSaved] = useState(false);
  const [localModels, setLocalModels] = useState<string[] | null>(null);
  const [dataStatus, setDataStatus] = useState<string | null>(null);
  const [pageAccess, setPageAccess] = useState<boolean | null>(null);
  const [debuggerAccess, setDebuggerAccess] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLocal = draft.provider === 'openai-compatible';
  const isGemini = draft.provider === 'gemini';

  useEffect(() => {
    const refresh = () => {
      hasPageAccess().then(setPageAccess);
      if (!import.meta.env.FIREFOX) hasDebuggerPermission().then(setDebuggerAccess);
    };
    refresh();
    return watchPermissions(refresh);
  }, []);

  function update(patch: Partial<Settings>) {
    setDraft((d) => ({ ...d, ...patch }));
    setTest({ state: 'idle' });
  }

  function switchProvider(provider: ProviderKind) {
    update({
      provider,
      model:
        provider === 'anthropic'
          ? props.settings.model || MODELS[1].id
          : provider === 'gemini'
            ? GEMINI_MODELS[1].id
            : draft.model,
    });
    setLocalModels(null);
  }

  async function save() {
    if (isLocal) await requestServerAccess(draft.baseUrl.trim());
    await setSettings({ ...draft, apiKey: draft.apiKey.trim(), baseUrl: draft.baseUrl.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    props.onDone?.();
  }

  async function testConnection() {
    setTest({ state: 'testing' });
    try {
      if (isLocal) await requestServerAccess(draft.baseUrl);
      await createProvider(draft).validateKey(draft.model);
      setTest({ state: 'ok' });
    } catch (err) {
      setTest({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function fetchModels() {
    try {
      await requestServerAccess(draft.baseUrl);
      const models = await listOpenAICompatibleModels({
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey || undefined,
      });
      setLocalModels(models);
      if (models.length > 0 && !models.includes(draft.model)) {
        update({ model: models[0] });
      }
    } catch (err) {
      setTest({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function exportChats() {
    try {
      const envelope = await exportAllData();
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${APP_NAME.toLowerCase()}-chats-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDataStatus(`Exported ${envelope.conversations.length} conversation(s).`);
    } catch (err) {
      setDataStatus(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function importChats(file: File) {
    try {
      const result = await importData(JSON.parse(await file.text()));
      setDataStatus(
        `Imported ${result.imported} conversation(s)` +
          (result.skipped ? `, skipped ${result.skipped} already present.` : '.'),
      );
    } catch (err) {
      setDataStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const canSave = isLocal
    ? !!(draft.baseUrl.trim() && draft.model.trim())
    : !!draft.apiKey.trim();

  return (
    <div className="h-full space-y-6 overflow-y-auto p-4">
      {!props.settings.apiKey && props.settings.provider === 'anthropic' && (
        <p className="text-body-sm leading-relaxed text-muted">
          {APP_NAME} talks directly to the model provider you choose — no middleman server.
          Use your own Anthropic key, or run a free local model with LM Studio / Ollama.
        </p>
      )}

      <Section title="Provider">
        <Field label="Provider">
          <Select
            value={draft.provider}
            onChange={(e) => switchProvider(e.target.value as ProviderKind)}
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="gemini">Google (Gemini)</option>
            <option value="openai-compatible">Local / OpenAI-compatible (free)</option>
          </Select>
        </Field>

        {isLocal && (
          <>
            <Field label="Server URL">
              <Input
                mono
                value={draft.baseUrl}
                onChange={(e) => update({ baseUrl: e.target.value })}
                placeholder="http://localhost:1234/v1"
                spellCheck={false}
              />
              <div className="mt-2 flex gap-1.5">
                {BASE_URL_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => update({ baseUrl: preset.url })}
                    className={`rounded-full border px-3 py-1 text-label-md transition-colors ${
                      draft.baseUrl === preset.url
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-border text-faint hover:text-muted'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Model">
              <div className="flex gap-2">
                {localModels ? (
                  <Select
                    value={draft.model}
                    onChange={(e) => update({ model: e.target.value })}
                    className="flex-1"
                  >
                    {localModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    mono
                    value={draft.model}
                    onChange={(e) => update({ model: e.target.value })}
                    placeholder="qwen/qwen3-4b"
                    spellCheck={false}
                    className="flex-1"
                  />
                )}
                <Button onClick={fetchModels}>Fetch</Button>
              </div>
            </Field>

            <Field label="API key (optional for local servers)">
              <KeyInput
                value={draft.apiKey}
                show={showKey}
                onToggleShow={() => setShowKey(!showKey)}
                onChange={(apiKey) => update({ apiKey })}
                placeholder="leave empty for LM Studio / Ollama"
              />
            </Field>
          </>
        )}

        {isGemini && (
          <>
            <Field label="Gemini API key">
              <KeyInput
                value={draft.apiKey}
                show={showKey}
                onToggleShow={() => setShowKey(!showKey)}
                onChange={(apiKey) => update({ apiKey })}
                placeholder="AIza…"
              />
            </Field>
            <Field label="Model">
              <Select value={draft.model} onChange={(e) => update({ model: e.target.value })}>
                {GEMINI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        {!isLocal && !isGemini && (
          <>
            <Field label="Anthropic API key">
              <KeyInput
                value={draft.apiKey}
                show={showKey}
                onToggleShow={() => setShowKey(!showKey)}
                onChange={(apiKey) => update({ apiKey })}
                placeholder="sk-ant-…"
              />
            </Field>
            <Field label="Model">
              <Select value={draft.model} onChange={(e) => update({ model: e.target.value })}>
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={save} disabled={!canSave}>
            {saved ? 'Saved ✓' : 'Save'}
          </Button>
          <Button onClick={testConnection} disabled={!canSave || test.state === 'testing'}>
            {test.state === 'testing' ? 'Testing…' : 'Test connection'}
          </Button>
        </div>

        {test.state === 'ok' && <p className="text-body-sm text-accent">Connection works ✓</p>}
        {test.state === 'error' && (
          <Banner tone="danger" className="whitespace-pre-line">
            {test.message}
          </Banner>
        )}
      </Section>

      {isLocal && (
        <Section title="Capabilities">
          <Card className="space-y-4 p-4">
            <Toggle
              checked={draft.supportsTools}
              onChange={(supportsTools) => update({ supportsTools })}
              label="Tool calling"
              description="Page tools and actions"
            />
            <Toggle
              checked={draft.supportsVision}
              onChange={(supportsVision) => update({ supportsVision })}
              label="Vision"
              description="Screenshot tool"
            />
          </Card>
          <p className="text-label-sm text-faint">
            Turn off what your model can't do — tools quietly disable instead of erroring.
          </p>
        </Section>
      )}

      <Section title="Permissions">
        <PermissionRow
          label="Page access"
          status={pageAccess ? 'Granted — page tools enabled' : 'Not granted — chat only'}
          granted={!!pageAccess}
          onGrant={() => requestPageAccess()}
          onRevoke={() => revokePageAccess()}
        />
        {!import.meta.env.FIREFOX && (
          <>
            <PermissionRow
              label="Deep inspection (debugger)"
              status={
                debuggerAccess
                  ? 'Granted — full network/console tools'
                  : 'Not granted — lightweight capture only'
              }
              granted={!!debuggerAccess}
              onGrant={() => requestDebuggerPermission()}
              onRevoke={() => revokeDebuggerPermission()}
            />
            <p className="text-label-sm text-faint">
              Lets the assistant read response bodies and the full console via a per-tab debugger
              session you approve each time. Chrome shows a banner while one is active.
            </p>
          </>
        )}
        {props.settings.autoApproveOrigins.length > 0 && (
          <div className="space-y-1.5">
            <span className="font-mono text-label-sm tracking-wider text-faint uppercase">
              Trusted sites (no approval asked)
            </span>
            <Card className="divide-y divide-border">
              {props.settings.autoApproveOrigins.map((origin) => (
                <div key={origin} className="flex items-center justify-between px-3 py-2">
                  <span className="truncate font-mono text-label-md text-muted">{origin}</span>
                  <button
                    type="button"
                    title={`Stop auto-approving ${origin}`}
                    onClick={() => removeAutoApproveOrigin(origin)}
                    className="ml-2 text-faint transition-colors hover:text-danger"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </Card>
          </div>
        )}
      </Section>

      <Section title="Data">
        <div className="flex items-center gap-2">
          <Button onClick={exportChats}>Export JSON</Button>
          <Button onClick={() => fileInputRef.current?.click()}>Import JSON</Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importChats(file);
              e.target.value = '';
            }}
          />
        </div>
        {dataStatus && <p className="text-body-sm text-muted">{dataStatus}</p>}
        <p className="text-label-sm text-faint">
          Chat history stays on this device. Exports contain conversations only — never your API
          key.
        </p>
      </Section>
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="font-mono text-label-sm font-medium tracking-wider text-faint uppercase">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

function PermissionRow(props: {
  label: string;
  status: string;
  granted: boolean;
  onGrant: () => void;
  onRevoke: () => void;
}) {
  return (
    <Card className="flex items-center justify-between gap-2 px-3 py-2.5">
      <div className="min-w-0">
        <span className="block text-body-sm font-medium text-text">{props.label}</span>
        <span className="flex items-center gap-1.5 text-label-sm text-faint">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              props.granted ? 'bg-accent' : 'bg-border-strong'
            }`}
          />
          {props.status}
        </span>
      </div>
      {props.granted ? (
        <button
          type="button"
          onClick={props.onRevoke}
          className="shrink-0 text-label-md text-faint transition-colors hover:text-danger"
        >
          Revoke
        </button>
      ) : (
        <Button size="sm" variant="primary" onClick={props.onGrant} className="shrink-0">
          Grant
        </Button>
      )}
    </Card>
  );
}

function KeyInput(props: {
  value: string;
  show: boolean;
  placeholder: string;
  onToggleShow: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <Input
        mono
        type={props.show ? 'text' : 'password'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        autoComplete="off"
        spellCheck={false}
        className="flex-1"
      />
      <Button onClick={props.onToggleShow}>{props.show ? 'Hide' : 'Show'}</Button>
    </div>
  );
}
