import { sendToActiveTab } from '../../messaging';
import type { ToolExecResult } from '../registry';

function text(value: string, isError = false): ToolExecResult {
  return { content: [{ type: 'text', text: value }], isError: isError || undefined };
}

export async function executeGetInteractiveElements(): Promise<ToolExecResult> {
  const response = await sendToActiveTab({ type: 'get_interactive_elements' });
  if (!response.ok) return text(response.error, true);
  const { listing, count, url } = response.data;
  return text(`Interactive elements on ${url} (${count} shown):\n\n${listing}`);
}

export async function executeClickElement(
  input: Record<string, unknown>,
): Promise<ToolExecResult> {
  const index = Number(input.index);
  if (!Number.isInteger(index) || index < 0) {
    return text('click_element requires a non-negative integer "index".', true);
  }
  const response = await sendToActiveTab({ type: 'click_element', index });
  if (!response.ok) return text(response.error, true);
  return text(response.data.result);
}

export async function executeFillForm(input: Record<string, unknown>): Promise<ToolExecResult> {
  const index = Number(input.index);
  const value = input.value;
  if (!Number.isInteger(index) || index < 0 || typeof value !== 'string') {
    return text('fill_form requires a non-negative integer "index" and a string "value".', true);
  }
  const response = await sendToActiveTab({ type: 'fill_form', index, value });
  if (!response.ok) return text(response.error, true);
  return text(response.data.result);
}
