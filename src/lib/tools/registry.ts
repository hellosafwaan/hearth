import type { ImagePart, TextPart } from '../providers/types';
import { executeNavigateTo, executeOpenTab } from './executors/browser';
import { executeClickElement, executeFillForm, executeGetInteractiveElements } from './executors/dom';
import { executeGetSelectedText, executeReadPage } from './executors/page';
import { executeScreenshot } from './executors/screenshot';

export interface ToolExecResult {
  content: (TextPart | ImagePart)[];
  isError?: boolean;
}

export type ToolExecutor = (input: Record<string, unknown>) => Promise<ToolExecResult>;

// v2: this is where tools get routed to their execution context —
// content-script tools (read_page, click) vs extension-API tools (open_tab).
export const toolRegistry: Record<string, ToolExecutor> = {
  read_page: executeReadPage,
  get_selected_text: executeGetSelectedText,
  screenshot: executeScreenshot,
  get_interactive_elements: executeGetInteractiveElements,
  click_element: executeClickElement,
  fill_form: executeFillForm,
  navigate_to: executeNavigateTo,
  open_tab: executeOpenTab,
};
