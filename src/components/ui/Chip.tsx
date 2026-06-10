import type { HTMLAttributes } from 'react';

export type ChipTone = 'neutral' | 'accent' | 'caution' | 'danger';

const TONES: Record<ChipTone, string> = {
  neutral: 'border-border bg-surface-raised text-muted',
  accent: 'border-accent/30 bg-accent-soft text-accent-strong',
  caution: 'border-caution/30 bg-caution-soft text-caution',
  danger: 'border-danger/30 bg-danger-soft text-danger-strong',
};

/** Small mono-spaced pill for tool activity, parameters, and presets. */
export function Chip({
  tone = 'neutral',
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-label-md ${TONES[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
