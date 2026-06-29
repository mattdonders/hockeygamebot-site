import React from 'react';
import { FilterChip, FilterChipGroup, FilterLabel } from './FilterPrimitives';

export type PosFilter = 'all' | 'F' | 'D';

type Props = {
  value: PosFilter;
  onChange: (v: PosFilter) => void;
};

export default function PositionFilter({ value, onChange }: Props) {
  return (
    <>
      <FilterLabel text="Position" />
      <FilterChipGroup>
        <FilterChip label="All"  active={value === 'all'} onClick={() => onChange('all')} />
        <FilterChip label="Fwds" active={value === 'F'}   onClick={() => onChange('F')} />
        <FilterChip label="Def"  active={value === 'D'}   onClick={() => onChange('D')} />
      </FilterChipGroup>
    </>
  );
}
