import { Chip, Spinner } from './ui';

const TOOL_LABELS: Record<string, string> = {
  screenshot: 'Screenshot',
  read_page: 'Read page',
  get_selected_text: 'Selection',
  get_interactive_elements: 'Scan page',
  click_element: 'Click',
  fill_form: 'Fill',
  navigate_to: 'Navigate',
  open_tab: 'New tab',
  get_page_tech: 'Tech stack',
  get_page_metadata: 'Metadata',
  find_in_page: 'Find',
  scroll: 'Scroll',
  wait: 'Wait',
  list_tabs: 'Tabs',
  read_console: 'Console',
  read_network: 'Network',
  inspect_element: 'Inspect',
  reload_and_capture: 'Reload + capture',
  enable_deep_inspection: 'Deep inspection',
  get_response_body: 'Response body',
  propose_plan: 'Plan',
};

export function ToolChip(props: { name: string; pending?: boolean }) {
  const label = TOOL_LABELS[props.name] ?? props.name;
  return (
    <Chip tone={props.pending ? 'accent' : 'neutral'}>
      {props.pending && <Spinner className="h-2.5 w-2.5" />}
      {label}
    </Chip>
  );
}
