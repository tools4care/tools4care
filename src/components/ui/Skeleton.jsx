// src/components/ui/Skeleton.jsx
// Pulsing placeholders shown while data loads, instead of a spinner.

export function SkeletonRow({ columns = 4 }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonCard({ className = "" }) {
  return (
    <div className={`animate-pulse bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 ${className}`}>
      <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-2/3 mb-3" />
      <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-1/2 mb-2" />
      <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-1/3" />
    </div>
  );
}
