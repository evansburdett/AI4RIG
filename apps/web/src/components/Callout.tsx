import type { ReactNode } from 'react';

interface Props {
  tone: 'blocked' | 'warning' | 'info';
  title: string;
  children: ReactNode;
}

/** A standing notice about something the software cannot know yet. */
export function Callout({ tone, title, children }: Props) {
  return (
    <div className={`callout callout-${tone}`}>
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}
