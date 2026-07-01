import React from 'react';
import { FilterChip, FilterChipGroup, FilterLabel } from './FilterPrimitives';

export type GameType = 'regular' | 'playoffs';

type Props = {
  value: GameType;
  onChange: (v: GameType) => void;
};

export default function GameTypeFilter({ value, onChange }: Props) {
  return (
    <div>
      <FilterLabel text="Game Type" />
      <FilterChipGroup>
        <FilterChip label="Reg Season" active={value === 'regular'}  onClick={() => onChange('regular')} />
        <FilterChip label="Playoffs"   active={value === 'playoffs'} onClick={() => onChange('playoffs')} />
      </FilterChipGroup>
    </div>
  );
}
