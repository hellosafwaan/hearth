import { storage } from '#imports';

// Handoff slot for "highlight and ask": the background script writes the
// selection here from the context-menu click, the sidepanel picks it up and
// prefills the composer.

export interface PendingSelection {
  id: string;
  text: string;
  url: string;
  title: string;
}

const pendingSelectionItem = storage.defineItem<PendingSelection | null>(
  'local:pendingSelection',
  { fallback: null },
);

export function setPendingSelection(selection: PendingSelection): Promise<void> {
  return pendingSelectionItem.setValue(selection);
}

export function takePendingSelection(): Promise<PendingSelection | null> {
  return pendingSelectionItem.getValue().then(async (value) => {
    if (value) await pendingSelectionItem.setValue(null);
    return value;
  });
}

export function watchPendingSelection(
  callback: (selection: PendingSelection) => void,
): () => void {
  return pendingSelectionItem.watch((value) => {
    if (value) callback(value);
  });
}

export function clearPendingSelection(): Promise<void> {
  return pendingSelectionItem.setValue(null);
}

export function formatSelectionDraft(selection: PendingSelection): string {
  return `Regarding this selection from "${selection.title}":\n\n"${selection.text.trim()}"\n\n`;
}
