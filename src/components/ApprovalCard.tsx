import { useState } from 'react';

export interface ApprovalDecision {
  approved: boolean;
  rememberOrigin: boolean;
}

export interface PendingApproval {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
  /** Host of the page the action targets, for the "always allow" toggle. */
  host: string | null;
  resolve: (decision: ApprovalDecision) => void;
}

const ACTION_LABELS: Record<string, string> = {
  click_element: 'Click element',
  fill_form: 'Fill field',
  navigate_to: 'Navigate',
  open_tab: 'Open new tab',
};

export function ApprovalCard(props: { approval: PendingApproval }) {
  const { approval } = props;
  const [remember, setRemember] = useState(false);

  const label = ACTION_LABELS[approval.name] ?? approval.name;
  const details = Object.entries(approval.input).map(
    ([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`,
  );

  return (
    <div className="mx-3 mb-2 space-y-2 rounded-md border border-amber-700/60 bg-amber-950/30 p-3">
      <div className="flex items-center gap-2">
        <span className="text-amber-400">⚠</span>
        <span className="text-xs font-semibold text-amber-200">
          {label}
          {approval.host && <span className="font-normal text-amber-400"> on {approval.host}</span>}
        </span>
      </div>

      {details.length > 0 && (
        <div className="rounded bg-zinc-950/60 px-2 py-1.5 font-mono text-[0.7rem] break-all text-zinc-300">
          {details.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}

      {approval.host && (
        <label className="flex cursor-pointer items-center gap-2 text-[0.7rem] text-amber-300/80">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="accent-amber-500"
          />
          Always allow actions on {approval.host}
        </label>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => approval.resolve({ approved: true, rememberOrigin: remember })}
          className="flex-1 rounded-md border border-emerald-800 bg-emerald-950/50 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-950"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => approval.resolve({ approved: false, rememberOrigin: false })}
          className="flex-1 rounded-md border border-red-900 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-950"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
