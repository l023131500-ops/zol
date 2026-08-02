import type { ReactNode } from 'react';

export function PageHeader({
  title,
  lead,
  eyebrow,
}: {
  title: string;
  lead?: string;
  eyebrow?: string;
}) {
  return (
    <header className="border-b border-[var(--grey-200)] bg-[var(--white)]">
      <div className="mx-auto max-w-4xl px-4 py-10">
        {eyebrow ? (
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--blue-600)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 text-3xl font-bold text-[var(--navy-700)] md:text-4xl">{title}</h1>
        {lead ? <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--grey-700)]">{lead}</p> : null}
      </div>
    </header>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="space-y-4 text-base leading-7 text-[var(--grey-700)] [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[var(--navy-700)] [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_a]:text-[var(--blue-600)] [&_a]:underline [&_ul]:list-disc [&_ul]:ps-6 [&_li]:mt-1">
        {children}
      </div>
    </div>
  );
}
