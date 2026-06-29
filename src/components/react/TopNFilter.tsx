import React from 'react';
import { FilterChip, FilterChipGroup, FilterLabel } from './FilterPrimitives';

export type TopN = null | number;

const DEFAULT_OPTIONS: TopN[] = [null, 10, 20, 50];

type Props = {
  value: TopN;
  onChange: (v: TopN) => void;
  /** Override the set of options. Defaults to [null, 10, 20, 50]. */
  options?: TopN[];
};

export default function TopNFilter({ value, onChange, options = DEFAULT_OPTIONS }: Props) {
  return (
    <>
      <FilterLabel text="Top N" />
      <FilterChipGroup>
        {options.map(n => (
          <FilterChip
            key={String(n)}
            label={n ? `Top ${n}` : 'All'}
            active={value === n}
            onClick={() => onChange(n)}
          />
        ))}
      </FilterChipGroup>
    </>
  );
}
