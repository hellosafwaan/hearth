import type { ReactNode } from 'react';

export type BannerTone = 'info' | 'caution' | 'danger';

const TONES: Record<BannerTone, string> = {
  info: 'border-border bg-surface-raised text-muted',
  caution: 'border-caution/40 bg-caution-soft text-caution',
  danger: 'border-danger/40 bg-danger-soft text-danger-strong',
};

/** Inline status strip for errors, warnings, and permission prompts. */
export function Banner(props: { tone?: BannerTone; children: ReactNode; className?: string }) {
  const tone = props.tone ?? 'info';
  return (
    <div
      className={`rounded-md border px-3 py-2 text-body-sm break-words ${TONES[tone]} ${props.className ?? ''}`}
    >
      {props.children}
    </div>
  );
}
