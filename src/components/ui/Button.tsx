import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg font-medium hover:brightness-110 disabled:hover:brightness-100',
  secondary: 'border border-border text-text hover:bg-surface-hover',
  ghost: 'text-muted hover:bg-surface-hover hover:text-text',
  danger: 'border border-danger/40 text-danger-strong hover:bg-danger-soft',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-label-md rounded-md',
  md: 'px-4 py-2 text-body-sm rounded-lg',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 transition-colors disabled:cursor-default disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}
