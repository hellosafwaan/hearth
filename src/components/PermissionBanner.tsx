import { useEffect, useState } from 'react';
import { APP_NAME } from '../lib/constants';
import { hasPageAccess, requestPageAccess, watchPermissions } from '../lib/permissions';
import { Button } from './ui';

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
    <div className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-raised px-3 py-2.5">
      <p className="text-label-md leading-snug text-muted">
        Grant page access to let {APP_NAME} read and act on your tabs. Until then it can only
        chat.
      </p>
      <Button
        size="sm"
        variant="primary"
        className="shrink-0"
        onClick={() => requestPageAccess().then(() => hasPageAccess().then(setGranted))}
      >
        Grant access
      </Button>
    </div>
  );
}
