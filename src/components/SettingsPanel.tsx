import { useRef, useState } from 'react';
import { APP_NAME, MODELS } from '../lib/constants';
import { exportAllData, importData } from '../lib/db/export';
import { createAnthropicProvider } from '../lib/providers/anthropic';
import { removeAutoApproveOrigin, setSettings, type Settings } from '../lib/settings/storage';

type TestStatus = { state: 'idle' } | { state: 'testing' } | { state: 'ok' } | { state: 'error'; message: string };

export function SettingsPanel(props: { settings: Settings; onDone?: () => void }) {
  const [apiKey, setApiKey] = useState(props.settings.apiKey);
  const [model, setModel] = useState(props.settings.model);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestStatus>({ state: 'idle' });
  const [saved, setSaved] = useState(false);
  const [dataStatus, setDataStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function save() {
    await setSettings({ ...props.settings, apiKey: apiKey.trim(), model });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    props.onDone?.();
  }

  async function testKey() {
    setTest({ state: 'testing' });
    try {
      await createAnthropicProvider(apiKey.trim()).validateKey(model);
      setTest({ state: 'ok' });
    } catch (err) {
      setTest({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="space-y-5 overflow-y-auto p-4">
      {!props.settings.apiKey && (
        <p className="text-xs leading-relaxed text-zinc-400">
          {APP_NAME} is bring-your-own-key. Your key is stored only on this device
          (<code className="font-mono text-zinc-300">storage.local</code>) and is used
          exclusively to call the API provider directly. No other server is involved.
        </p>
      )}

      <Field label="Anthropic API key">
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-…"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="rounded-md border border-zinc-800 px-2.5 text-xs text-zinc-400 hover:bg-zinc-900"
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
      </Field>

      <Field label="Model">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-zinc-600"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!apiKey.trim()}
          className="rounded-md border border-emerald-800 bg-emerald-950/50 px-4 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-950 disabled:opacity-40"
        >
          {saved ? 'Saved ✓' : 'Save'}
        </button>
        <button
          type="button"
          onClick={testKey}
          disabled={!apiKey.trim() || test.state === 'testing'}
          className="rounded-md border border-zinc-700 px-4 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-900 disabled:opacity-40"
        >
          {test.state === 'testing' ? 'Testing…' : 'Test key'}
        </button>
      </div>

      {test.state === 'ok' && <p className="text-xs text-emerald-400">Key works ✓</p>}
      {test.state === 'error' && (
        <p className="text-xs break-words text-red-400">{test.message}</p>
      )}

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
                <span className="truncate font-mono text-[0.7rem] text-zinc-300">
                  {origin}
                </span>
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
