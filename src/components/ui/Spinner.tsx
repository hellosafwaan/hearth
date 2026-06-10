/** Small circular spinner for running states. */
export function Spinner(props: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-border-strong border-t-accent ${props.className ?? ''}`}
    />
  );
}
