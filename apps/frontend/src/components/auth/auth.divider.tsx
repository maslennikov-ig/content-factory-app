import { FC } from 'react';

export const AuthDivider: FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-[12px]" role="separator" aria-hidden>
    <span className="flex-1 h-px bg-cf-border" />
    <span className="text-[12px] font-[600] uppercase tracking-[0.06em] text-cf-ink-muted">
      {label}
    </span>
    <span className="flex-1 h-px bg-cf-border" />
  </div>
);
