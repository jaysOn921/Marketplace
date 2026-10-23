import type { ReactNode } from 'react';

export function AuthLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {intro && <p className="mt-2 text-stone-600">{intro}</p>}
      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-5 md:p-6">{children}</div>
    </div>
  );
}
