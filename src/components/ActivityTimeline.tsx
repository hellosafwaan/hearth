import { useEffect, useState } from 'react';
import { TOOL_LABELS } from './ToolChip';
import { Spinner } from './ui';

// The agent activity trace: a collapsible "N steps" header expanding to a
// vertical timeline — plan node, tool steps (batched when the model called
// several tools in one turn), inline screenshot thumbnails, and a Done node.
// Auto-expanded while the turn is running, collapsed in history.

export interface TimelineAction {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'ok' | 'error' | 'skipped';
  errorText?: string;
  image?: { mediaType: string; data: string };
}

export interface TimelineStep {
  actions: TimelineAction[];
}

export function ActivityTimeline(props: { steps: TimelineStep[]; live: boolean }) {
  const { steps, live } = props;
  const [expanded, setExpanded] = useState(live);

  // Follow the run: open while it works, fold away when it finishes.
  useEffect(() => {
    setExpanded(live);
  }, [live]);

  const done = !live && steps.every((s) => s.actions.every((a) => a.status !== 'running'));

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-body-sm text-faint transition-colors hover:text-muted"
      >
        {steps.length} step{steps.length === 1 ? '' : 's'}
        <span className={`text-label-sm transition-transform ${expanded ? 'rotate-180' : ''}`}>
          ⌄
        </span>
      </button>

      {expanded && (
        <div className="relative mt-2 space-y-3">
          <span aria-hidden className="absolute top-2 bottom-2 left-[9px] w-px bg-border" />
          {steps.map((step, i) => (
            <Step key={i} step={step} />
          ))}
          {done && (
            <Node marker={<span className="text-accent">✓</span>}>
              <span className="text-body-sm text-muted">Done</span>
            </Node>
          )}
        </div>
      )}
    </div>
  );
}

function Step(props: { step: TimelineStep }) {
  const { actions } = props.step;

  // A plan gets its own node style; the steps the model proposed show inline.
  if (actions.length === 1 && actions[0].name === 'propose_plan') {
    const plan = actions[0];
    const planSteps = (Array.isArray(plan.input.steps) ? plan.input.steps : []).filter(
      (s): s is string => typeof s === 'string',
    );
    return (
      <Node marker={<StatusMarker action={plan} glyph="≡" />}>
        <span className="text-body-sm text-muted">
          {plan.status === 'error' ? 'Plan denied' : 'Created a plan'}
        </span>
        {planSteps.length > 0 && plan.status !== 'error' && (
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-label-md text-faint">
            {planSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        )}
      </Node>
    );
  }

  if (actions.length === 1) {
    return (
      <Node marker={<StatusMarker action={actions[0]} />}>
        <ActionRow action={actions[0]} />
      </Node>
    );
  }

  const doneCount = actions.filter((a) => a.status === 'ok' || a.status === 'error').length;
  return (
    <Node marker={<span className="text-faint">⧉</span>}>
      <span className="text-body-sm text-muted">
        Batch — {doneCount}/{actions.length} actions
      </span>
      <div className="mt-1.5 space-y-1.5">
        {actions.map((action) => (
          <div key={action.id} className="flex items-start gap-2">
            <span className="mt-0.5 w-3.5 text-center">
              <StatusMarker action={action} />
            </span>
            <ActionRow action={action} />
          </div>
        ))}
      </div>
    </Node>
  );
}

function Node(props: { marker: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative pl-7">
      <span className="absolute top-0 left-0 flex h-5 w-[19px] items-center justify-center rounded-full bg-surface text-label-md">
        {props.marker}
      </span>
      <div className="min-w-0">{props.children}</div>
    </div>
  );
}

function StatusMarker(props: { action: TimelineAction; glyph?: string }) {
  switch (props.action.status) {
    case 'running':
      return <Spinner className="h-3 w-3" />;
    case 'ok':
      return props.glyph ? (
        <span className="text-faint">{props.glyph}</span>
      ) : (
        <span className="text-accent">✓</span>
      );
    case 'error':
      return <span className="text-danger">✕</span>;
    case 'skipped':
      return <span className="text-faint">·</span>;
  }
}

function ActionRow(props: { action: TimelineAction }) {
  const { action } = props;
  const label = TOOL_LABELS[action.name] ?? action.name;
  const detail =
    typeof action.input.url === 'string'
      ? action.input.url
      : typeof action.input.query === 'string'
        ? `"${action.input.query}"`
        : null;

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="text-body-sm text-muted">{label}</span>
        {detail && (
          <span className="truncate font-mono text-label-sm text-faint">{detail}</span>
        )}
        {action.image && (
          <img
            src={`data:${action.image.mediaType};base64,${action.image.data}`}
            alt={`${label} result`}
            className="ml-auto h-9 rounded-sm border border-border"
          />
        )}
      </div>
      {action.status === 'error' && action.errorText && (
        <p className="mt-0.5 line-clamp-2 text-label-sm text-danger-strong">{action.errorText}</p>
      )}
    </div>
  );
}
