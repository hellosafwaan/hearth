import type { ButtonHTMLAttributes } from 'react';

/** Square icon-only button for headers and compact rows. */
export function IconButton({
  label,
  active = false,
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Accessible name; also shown as the tooltip. */
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-base leading-none transition-colors hover:bg-surface-hover hover:text-text ${
        active ? 'bg-surface-hover text-text' : 'text-faint'
      } ${className}`}
      {...rest}
    />
  );
}
