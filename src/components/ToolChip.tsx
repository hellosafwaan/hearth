const TOOL_LABELS: Record<string, string> = {
  screenshot: '📸 Screenshot',
  read_page: '📄 Read page',
  get_selected_text: '✂️ Selection',
  get_interactive_elements: '🔍 Scan page',
  click_element: '🖱️ Click',
  fill_form: '⌨️ Fill',
  navigate_to: '🧭 Navigate',
  open_tab: '🗂️ New tab',
  get_page_tech: '🧬 Tech stack',
  get_page_metadata: 'ℹ️ Metadata',
  find_in_page: '🔎 Find',
  scroll: '↕️ Scroll',
  wait: '⏳ Wait',
  list_tabs: '🗃️ Tabs',
  read_console: '🖥️ Console',
  read_network: '🌐 Network',
  inspect_element: '🔬 Inspect',
  reload_and_capture: '🔄 Reload + capture',
  enable_deep_inspection: '🛠️ Deep inspection',
  get_response_body: '📦 Response body',
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
