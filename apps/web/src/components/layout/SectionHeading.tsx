import React from 'react';

export interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  badge?: string;
  className?: string;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({
  title,
  subtitle,
  action,
  badge,
  className = '',
}) => {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border ${className}`}>
      <div className="space-y-1">
        <div className="flex items-center space-x-2.5">
          <h2 className="text-xl font-bold tracking-tight text-text-primary">{title}</h2>
          {badge && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-surface border border-border text-accent">
              {badge}
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-text-secondary">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center space-x-2">{action}</div>}
    </div>
  );
};
