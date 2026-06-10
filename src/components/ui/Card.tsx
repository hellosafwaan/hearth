import type { HTMLAttributes } from 'react';

/**
 * Level-1 surface: raised background + border. `overlay` lifts it to level 2
 * (sheets, menus) with a shadow.
 */
export function Card({
  overlay = false,
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement> & { overlay?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-border ${
        overlay ? 'bg-surface-overlay shadow-overlay' : 'bg-surface-raised'
      } ${className}`}
      {...rest}
    />
  );
}
