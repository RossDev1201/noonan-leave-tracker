"use client";

import { useEffect, useState } from "react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  if (!mounted) return null;

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className={`border px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors
        border-noonan-lightgray bg-white text-noonan-gray hover:border-noonan-red hover:text-noonan-red
        dark:border-[#333] dark:bg-[#111] dark:text-noonan-cream dark:hover:border-noonan-red dark:hover:text-noonan-red
        ${className}`}
    >
      {dark ? "☀ Light" : "◑ Dark"}
    </button>
  );
}
