const TOOL_LABELS: Record<string, string> = {
  screenshot: '📸 Screenshot',
};

export function ToolChip(props: { name: string; pending?: boolean }) {
  const label = TOOL_LABELS[props.name] ?? `🔧 ${props.name}`;
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-[0.7rem] text-zinc-400">
      <span>{label}</span>
      {props.pending && <span className="animate-pulse text-emerald-500">●</span>}
    </div>
  );
}
