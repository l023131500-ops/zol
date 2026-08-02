'use client';

import { useState } from 'react';
import { computeArnona, type ArnonaResult } from '@kesef/metrics';
import { Bdi, ValueStatus, formatShekel } from '@kesef/ui';

/**
 * Interactive arnona calculator (task 34). Because the authority's צו ארנונה
 * is not yet loaded, the tariff is a user input and the result is marked
 * `estimated` — never presented as an authoritative bill.
 */
export function ArnonaCalculator() {
  const [area, setArea] = useState('80');
  const [tariff, setTariff] = useState('45');
  const [seniorDiscount, setSeniorDiscount] = useState(false);
  const [disabilityDiscount, setDisabilityDiscount] = useState(false);

  const discounts = [
    ...(seniorDiscount ? [{ label: 'אזרח ותיק', pct: 30 }] : []),
    ...(disabilityDiscount ? [{ label: 'נכות', pct: 20 }] : []),
  ];
  const result: ArnonaResult = computeArnona({
    areaSqm: Number(area) || 0,
    tariffPerSqm: Number(tariff) || 0,
    discounts,
  });

  return (
    <div className="rounded-xl border border-[var(--grey-200)] bg-[var(--white)] p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[var(--navy-700)]">מחשבון ארנונה</h2>
        <ValueStatus kind="estimated" detail="לפי תעריף שהוזן — צו הארנונה טרם נטען" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="area" className="block text-sm font-medium text-[var(--grey-700)]">
            שטח הנכס (מ״ר)
          </label>
          <input
            id="area"
            type="number"
            min={0}
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--grey-200)] px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="tariff" className="block text-sm font-medium text-[var(--grey-700)]">
            תעריף למ״ר (₪)
          </label>
          <input
            id="tariff"
            type="number"
            min={0}
            step="0.01"
            value={tariff}
            onChange={(e) => setTariff(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--grey-200)] px-3 py-2"
          />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-[var(--grey-700)]">הנחות אפשריות</legend>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={seniorDiscount} onChange={(e) => setSeniorDiscount(e.target.checked)} />
          אזרח ותיק (30%)
        </label>
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={disabilityDiscount} onChange={(e) => setDisabilityDiscount(e.target.checked)} />
          נכות (20%)
        </label>
      </fieldset>

      <div className="mt-5 rounded-lg bg-[var(--grey-50)] p-4">
        <table className="w-full text-sm">
          <caption className="sr-only">פירוט חישוב הארנונה</caption>
          <tbody>
            {result.lines.map((line, i) => (
              <tr key={i} className={i === result.lines.length - 1 ? 'border-t border-[var(--grey-200)] font-semibold' : ''}>
                <td className="py-1 text-[var(--grey-700)]">{line.label}</td>
                <td className="py-1 text-end">
                  <Bdi>{formatShekel(Math.round(line.amount))}</Bdi>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--grey-500)]">
        חישוב מוערך בלבד, אינו מהווה חיוב רשמי. עם טעינת צו הארנונה של הרשות יוצגו התעריפים
        האמיתיים לפי סיווג ואזור.
      </p>
    </div>
  );
}
