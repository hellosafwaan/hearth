import type { ImagePart, TextPart } from '../providers/types';
import { executeNavigateTo, executeOpenTab } from './executors/browser';
import { executeClickElement, executeFillForm, executeGetInteractiveElements } from './executors/dom';
import {
  executeFindInPage,
  executeGetPageMetadata,
  executeGetPageTech,
  executeGetSelectedText,
  executeReadPage,
  executeScroll,
} from './executors/page';
import {
  executeEnableDeepInspection,
  executeGetResponseBody,
  executeInspectElement,
  executeReadConsole,
  executeReadNetwork,
  executeReloadAndCapture,
} from './executors/devtools';
import { executeScreenshot } from './executors/screenshot';
import { executeListTabs, executeWait } from './executors/utility';
import { withRetry } from './retry';

export interface ToolExecResult {
  content: (TextPart | ImagePart)[];
  isError?: boolean;
}

export type ToolExecutor = (input: Record<string, unknown>) => Promise<ToolExecResult>;

// v2: this is where tools get routed to their execution context —
// content-script tools (read_page, click) vs extension-API tools (open_tab).
const executors: Record<string, ToolExecutor> = {
  read_page: executeReadPage,
  get_selected_text: executeGetSelectedText,
  screenshot: executeScreenshot,
  get_interactive_elements: executeGetInteractiveElements,
  click_element: executeClickElement,
  fill_form: executeFillForm,
  navigate_to: executeNavigateTo,
  open_tab: executeOpenTab,
  get_page_tech: executeGetPageTech,
  get_page_metadata: executeGetPageMetadata,
  find_in_page: executeFindInPage,
  scroll: executeScroll,
  wait: executeWait,
  list_tabs: executeListTabs,
  read_console: executeReadConsole,
  read_network: executeReadNetwork,
  inspect_element: executeInspectElement,
  reload_and_capture: executeReloadAndCapture,
  enable_deep_inspection: executeEnableDeepInspection,
  get_response_body: executeGetResponseBody,
};

// Every tool gets one automatic retry on transient failures (content script
// not ready, dropped message channel) — see retry.ts for what qualifies.
export const toolRegistry: Record<string, ToolExecutor> = Object.fromEntries(
  Object.entries(executors).map(([name, executor]) => [name, withRetry(executor)]),
);
