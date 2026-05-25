"use client";

import type { ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
}

export function Tabs({ items, value, onChange }: TabsProps) {
  return (
    <div className="inline-flex gap-1 p-1 rounded-xl bg-[rgba(17,24,42,0.5)] border border-[var(--color-line)] backdrop-blur">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className="tab"
          data-active={value === it.id}
          onClick={() => onChange(it.id)}
        >
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}
