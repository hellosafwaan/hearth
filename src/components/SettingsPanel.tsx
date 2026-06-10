import { useEffect, useRef, useState } from 'react';
import { APP_NAME, GEMINI_MODELS, MODELS } from '../lib/constants';
import { exportAllData, importData } from '../lib/db/export';
import {
  hasPageAccess,
  requestPageAccess,
  requestServerAccess,
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLocal = draft.provider === 'openai-compatible';
  const isGemini = draft.provider === 'gemini';

  useEffect(() => {
    const refresh = () => hasPageAccess().then(setPageAccess);
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
    <div className="space-y-5 overflow-y-auto p-4">
      {!props.settings.apiKey && props.settings.provider === 'anthropic' && (
        <p className="text-xs leading-relaxed text-zinc-400">
          {APP_NAME} talks directly to the model provider you choose — no middleman server.
          Use your own Anthropic key, or run a free local model with LM Studio / Ollama.
        </p>
      )}

      <Field label="Provider">
        <select
          value={draft.provider}
          onChange={(e) => switchProvider(e.target.value as ProviderKind)}
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-zinc-600"
        >
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="gemini">Google (Gemini)</option>
          <option value="openai-compatible">Local / OpenAI-compatible (free)</option>
        </select>
      </Field>

      {isLocal && (
        <>
          <Field label="Server URL">
            <input
              type="text"
              value={draft.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
              placeholder="http://localhost:1234/v1"
              spellCheck={false}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600"
            />
            <div className="mt-1.5 flex gap-1.5">
              {BASE_URL_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => update({ baseUrl: preset.url })}
                  className={`rounded border px-2 py-1 text-[0.65rem] transition-colors ${
                    draft.baseUrl === preset.url
                      ? 'border-emerald-700 text-emerald-400'
                      : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
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
                <select
                  value={draft.model}
                  onChange={(e) => update({ model: e.target.value })}
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-zinc-600"
                >
                  {localModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={draft.model}
                  onChange={(e) => update({ model: e.target.value })}
                  placeholder="qwen/qwen3-4b"
                  spellCheck={false}
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600"
                />
              )}
              <button
                type="button"
                onClick={fetchModels}
                className="rounded-md border border-zinc-800 px-2.5 text-xs text-zinc-400 hover:bg-zinc-900"
              >
                Fetch
              </button>
            </div>
          </Field>

          <Field label="Model capabilities">
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={draft.supportsTools}
                  onChange={(e) => update({ supportsTools: e.target.checked })}
                  className="accent-emerald-600"
                />
                Tool calling (page tools, actions)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={draft.supportsVision}
                  onChange={(e) => update({ supportsVision: e.target.checked })}
                  className="accent-emerald-600"
                />
                Vision (screenshot tool)
              </label>
              <p className="text-[0.65rem] text-zinc-600">
                Turn off what your model can't do — tools quietly disable instead of erroring.
              </p>
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
            <select
              value={draft.model}
              onChange={(e) => update({ model: e.target.value })}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-zinc-600"
            >
              {GEMINI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
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
            <select
              value={draft.model}
              onChange={(e) => update({ model: e.target.value })}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-zinc-600"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="rounded-md border border-emerald-800 bg-emerald-950/50 px-4 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-950 disabled:opacity-40"
        >
          {saved ? 'Saved ✓' : 'Save'}
        </button>
        <button
          type="button"
          onClick={testConnection}
          disabled={!canSave || test.state === 'testing'}
          className="rounded-md border border-zinc-700 px-4 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-900 disabled:opacity-40"
        >
          {test.state === 'testing' ? 'Testing…' : 'Test connection'}
        </button>
      </div>

      {test.state === 'ok' && <p className="text-xs text-emerald-400">Connection works ✓</p>}
      {test.state === 'error' && (
        <p className="text-xs break-words whitespace-pre-line text-red-400">{test.message}</p>
      )}

      <div className="space-y-1.5">
        <span className="font-mono text-[0.65rem] tracking-wider text-zinc-500 uppercase">
          Page access
        </span>
        <div className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5">
          <span className="text-xs text-zinc-300">
            {pageAccess ? 'Granted — page tools enabled' : 'Not granted — chat only'}
          </span>
          {pageAccess ? (
            <button
              type="button"
              onClick={() => revokePageAccess()}
              className="text-[0.7rem] text-zinc-500 hover:text-red-400"
            >
              Revoke
            </button>
          ) : (
            <button
              type="button"
              onClick={() => requestPageAccess()}
              className="rounded border border-sky-800 px-2 py-1 text-[0.7rem] text-sky-300 hover:bg-sky-950/50"
            >
              Grant
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="font-mono text-[0.65rem] tracking-wider text-zinc-500 uppercase">
          Chat history (stays on this device)
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportChats}
            className="rounded-md border border-zinc-700 px-4 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-900"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-zinc-700 px-4 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-900"
          >
            Import JSON
          </button>
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
        {dataStatus && <p className="text-xs text-zinc-400">{dataStatus}</p>}
        <p className="text-[0.65rem] text-zinc-600">
          Exports contain conversations only — never your API key.
        </p>
      </div>

      {props.settings.autoApproveOrigins.length > 0 && (
        <Field label="Trusted sites (actions run without approval)">
          <ul className="space-y-1">
            {props.settings.autoApproveOrigins.map((origin) => (
              <li
                key={origin}
                className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5"
              >
                <span className="truncate font-mono text-[0.7rem] text-zinc-300">{origin}</span>
                <button
                  type="button"
                  title={`Stop auto-approving ${origin}`}
                  onClick={() => removeAutoApproveOrigin(origin)}
                  className="ml-2 text-zinc-600 hover:text-red-400"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </Field>
      )}
    </div>
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
      <input
        type={props.show ? 'text' : 'password'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        autoComplete="off"
        spellCheck={false}
        className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600"
      />
      <button
        type="button"
        onClick={props.onToggleShow}
        className="rounded-md border border-zinc-800 px-2.5 text-xs text-zinc-400 hover:bg-zinc-900"
      >
        {props.show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[0.65rem] tracking-wider text-zinc-500 uppercase">
        {props.label}
      </span>
      {props.children}
    </label>
  );
}
