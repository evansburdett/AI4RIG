import type { ReactNode } from 'react';

interface Props {
  /** info: context. warning: something to act on. error: something failed. */
  tone: 'info' | 'warning' | 'error';
  title: string;
  children: ReactNode;
}

/** A notice at the top of a screen or section. Amber and red are for action only. */
export function Callout({ tone, title, children }: Props) {
  return (
    <div className={`callout callout-${tone}`}>
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}
