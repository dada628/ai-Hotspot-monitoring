"use client";

import { useEffect, useRef, useState } from "react";

export interface PillOption {
  id: string;
  label: string;
}

interface PillSelectProps {
  label: string;
  options: PillOption[];
  value: string;
  onChange: (id: string) => void;
  /** 高亮（视作"已筛选"） */
  active?: boolean;
}

export function PillSelect({
  label,
  options,
  value,
  onChange,
  active,
}: PillSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const current = options.find((o) => o.id === value);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        className="pill"
        data-active={active ?? value !== options[0]?.id}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current?.label ?? label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 min-w-[180px] glass-strong py-1 shadow-2xl fade-in">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2 text-sm transition-colors flex items-center gap-2 ${
                o.id === value
                  ? "text-[var(--color-brand-bright)] bg-[rgba(59,130,246,0.1)]"
                  : "text-[var(--color-text-dim)] hover:bg-[rgba(148,163,184,0.08)]"
              }`}
            >
              {o.id === value ? (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path
                    d="M2.5 6.5L5 9L9.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <span className="w-3" />
              )}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
