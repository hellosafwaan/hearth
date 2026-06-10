import { useEffect, useState } from 'react';
import { hasPageAccess, requestPageAccess, watchPermissions } from '../lib/permissions';

/**
 * Shown until the user grants host access. Without it the assistant can still
 * chat, but page tools (read, screenshot, actions) can't reach the tab.
 */
export function PermissionBanner() {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    const refresh = () => hasPageAccess().then(setGranted);
    refresh();
    return watchPermissions(refresh);
  }, []);

  if (granted !== false) return null;

  return (
    <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-md border border-sky-900/70 bg-sky-950/30 px-3 py-2">
      <p className="text-[0.7rem] leading-snug text-sky-200">
        Grant page access to let the assistant read and act on your tabs. Until
        then it can only chat.
      </p>
      <button
        type="button"
        onClick={() => requestPageAccess().then(() => hasPageAccess().then(setGranted))}
        className="shrink-0 rounded-md border border-sky-700 bg-sky-950/60 px-3 py-1.5 text-xs font-medium text-sky-200 transition-colors hover:bg-sky-900/50"
      >
        Grant page access
      </button>
    </div>
  );
}
