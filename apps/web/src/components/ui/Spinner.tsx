import React from 'react';
import { Loader2 } from 'lucide-react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  className = '',
  label,
}) => {
  return (
    <div className="inline-flex items-center space-x-2 text-text-muted">
      <Loader2 className={`animate-spin text-primary ${sizeMap[size]} ${className}`} />
      {label && <span className="text-xs font-medium text-text-secondary">{label}</span>}
    </div>
  );
};
