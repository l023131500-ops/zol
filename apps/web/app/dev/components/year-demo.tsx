'use client';

import { useState } from 'react';
import { YearSwitcher } from '@kesef/ui';

export function YearDemo() {
  const [year, setYear] = useState(2024);
  return (
    <YearSwitcher
      years={[2020, 2021, 2022, 2023, 2024]}
      selected={year}
      onSelect={setYear}
      yearsWithoutData={[2021]}
    />
  );
}
