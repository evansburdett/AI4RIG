import type { ReactNode } from 'react';

interface Props {
  tone: 'blocked' | 'warning' | 'info';
  title: string;
  children: ReactNode;
}

/**
 * A standing notice about something the software cannot know yet.
 *
 * These exist because the alternative is worse. The allocation targets are the
 * clearest case: a screen that quietly showed no targets would read as "this
 * client is on target", and a screen that showed invented percentages would
 * read as firm policy. Saying plainly what is missing, on the screen where it
 * would have been used, is the only version that does not mislead somebody.
 */
export function Callout({ tone, title, children }: Props) {
  return (
    <div className={`callout callout-${tone}`}>
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}
