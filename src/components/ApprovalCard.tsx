import { useState } from 'react';
import { Button, Card } from './ui';

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

const ACTIONS: Record<string, { label: string; description: string }> = {
  click_element: {
    label: 'Click element',
    description: 'Sidekick wants to click an element on the current page.',
  },
  fill_form: {
    label: 'Fill out a field',
    description:
      'Sidekick wants to type into a field on the current page. This may submit data from your session.',
  },
  navigate_to: {
    label: 'Navigate',
    description: 'Sidekick wants to navigate this tab to a different URL.',
  },
  open_tab: {
    label: 'Open new tab',
    description: 'Sidekick wants to open a URL in a new tab.',
  },
  reload_and_capture: {
    label: 'Reload with capture',
    description:
      'Sidekick wants to reload this page with console/network capture armed. Unsaved page state may be lost.',
  },
  enable_deep_inspection: {
    label: 'Attach debugger',
    description:
      'Sidekick wants to attach a debugger to this tab for full network and console visibility. Chrome will show a debugging banner while it is active.',
  },
};

export function ApprovalCard(props: { approval: PendingApproval }) {
  const { approval } = props;
  const [remember, setRemember] = useState(false);

  const action = ACTIONS[approval.name] ?? {
    label: approval.name,
    description: 'Sidekick wants to perform this action.',
  };
  const details = Object.entries(approval.input);

  return (
    <Card overlay className="mx-3 mb-2 space-y-3 p-4">
      <div>
        <span className="font-mono text-label-sm tracking-wider text-faint uppercase">
          Action required
        </span>
        <h3 className="text-headline font-bold text-text">{action.label}</h3>
      </div>

      {approval.host && (
        <div className="flex items-center gap-2 rounded-lg bg-surface-raised px-3 py-2">
          <span className="font-mono text-label-sm text-faint">Target</span>
          <span className="truncate font-mono text-label-md font-medium text-text">
            {approval.host}
          </span>
        </div>
      )}

      <p className="text-body-sm text-muted">{action.description}</p>

      {details.length > 0 && (
        <div className="space-y-1">
          <span className="font-mono text-label-sm text-faint">Payload</span>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised px-3 py-2 font-mono text-label-md break-all text-muted">
            {details.map(([key, value]) => (
              <div key={key}>
                <span className="text-faint">{key}:</span>{' '}
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </div>
            ))}
          </div>
        </div>
      )}

      {approval.host && (
        <label className="flex cursor-pointer items-center gap-2 text-label-md text-faint">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="accent-(--sk-accent)"
          />
          Always allow actions on {approval.host}
        </label>
      )}

      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => approval.resolve({ approved: true, rememberOrigin: remember })}
        >
          ✓ Approve
        </Button>
        <Button
          className="flex-1"
          onClick={() => approval.resolve({ approved: false, rememberOrigin: false })}
        >
          ✕ Deny
        </Button>
      </div>
    </Card>
  );
}
