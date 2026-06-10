/** Switch-styled checkbox for capability and permission rows. */
export function Toggle(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-3 ${
        props.disabled ? 'opacity-40' : 'cursor-pointer'
      }`}
    >
      <span className="min-w-0">
        <span className="block text-body-sm text-text">{props.label}</span>
        {props.description && (
          <span className="block text-label-sm text-faint">{props.description}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          props.checked ? 'bg-accent' : 'bg-border-strong'
        }`}
      >
        {/* Track is 36px, thumb 16px, 2px inset each side → 16px of travel. */}
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            props.checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}
