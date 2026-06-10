import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

/** Labeled form row: mono uppercase section label above the control. */
export function Field(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-label-sm tracking-wider text-faint uppercase">
        {props.label}
      </span>
      {props.children}
      {props.hint && <p className="text-label-sm text-faint">{props.hint}</p>}
    </label>
  );
}

const CONTROL =
  'w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-body-sm text-text ' +
  'placeholder-faint outline-none transition-colors focus:border-accent';

export function Input({
  mono = false,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return (
    <input
      className={`${CONTROL} ${mono ? 'font-mono text-label-md' : ''} ${className}`}
      {...rest}
    />
  );
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${CONTROL} ${className}`} {...rest} />;
}
