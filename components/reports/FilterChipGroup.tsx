'use client';

import { useMemo } from 'react';

type FilterChipGroupProps = {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
};

export default function FilterChipGroup({ label, options, value, onChange }: FilterChipGroupProps) {
  const selected = useMemo(() => new Set(value), [value]);

  const toggle = (name: string) => {
    if (selected.has(name)) {
      onChange(value.filter((entry) => entry !== name));
      return;
    }
    onChange([...value, name]);
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-brand-text">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((name) => {
          const isActive = selected.has(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              aria-pressed={isActive}
              className={
                isActive
                  ? 'rounded-full border border-brand-primary bg-brand-primary px-3 py-1 text-xs font-medium text-brand-primaryText'
                  : 'rounded-full border border-brand-border bg-brand-surface px-3 py-1 text-xs text-brand-text hover:bg-brand-surface-alt'
              }
            >
              {name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
