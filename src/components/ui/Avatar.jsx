// src/components/ui/Avatar.jsx
// Rounded gradient circle with the first letter of `name`.
// Color is picked deterministically from `name` so the same
// client/product always gets the same color.

const GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-purple-500 to-violet-600",
  "from-cyan-500 to-sky-600",
];

const SIZES = {
  sm: "w-8 h-8 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-11 h-11 text-base",
};

function hashName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % GRADIENTS.length;
  }
  return Math.abs(hash);
}

export default function Avatar({ name = "?", size = "md", className = "" }) {
  const letter = (name.trim()[0] || "?").toUpperCase();
  const gradient = GRADIENTS[hashName(name)];
  const sizeClasses = SIZES[size] || SIZES.md;

  return (
    <div
      className={`${sizeClasses} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center font-bold text-white flex-shrink-0 ${className}`}
    >
      {letter}
    </div>
  );
}
