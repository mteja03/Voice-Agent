export function Skeleton({ className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200/90 dark:bg-gray-800/90 ${className}`}
      aria-hidden
    />
  );
}
