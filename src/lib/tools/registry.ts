import type { ImagePart, TextPart } from '../providers/types';
import { executeScreenshot } from './executors/screenshot';

export interface ToolExecResult {
  content: (TextPart | ImagePart)[];
  isError?: boolean;
}

export type ToolExecutor = (input: Record<string, unknown>) => Promise<ToolExecResult>;

// v2: this is where tools get routed to their execution context —
// content-script tools (read_page, click) vs extension-API tools (open_tab).
export const toolRegistry: Record<string, ToolExecutor> = {
  screenshot: executeScreenshot,
};
