import type { ReactNode } from 'react';

/**
 * An (i) beside a label. The explanation shows on hover and is read out by
 * screen readers, so it can come off the page without being lost.
 */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" role="img" aria-label={text} title={text}>
      i
    </span>
  );
}

/**
 * Background a reader may want once but not every time: how a section's
 * numbers are worked out. Closed by default.
 */
export function About({ title = 'About this view', children }: { title?: string; children: ReactNode }) {
  return (
    <details className="about">
      <summary>{title}</summary>
      {children}
    </details>
  );
}
