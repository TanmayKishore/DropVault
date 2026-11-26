import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  type?: ToastType;
  title: string;
  message?: string;
  onClose?: () => void;
  className?: string;
}

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-status-success flex-shrink-0" />,
  error: <AlertCircle className="w-4 h-4 text-status-error flex-shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-status-warning flex-shrink-0" />,
  info: <Info className="w-4 h-4 text-status-info flex-shrink-0" />,
};

const borderMap: Record<ToastType, string> = {
  success: 'border-status-success/30 bg-card',
  error: 'border-status-error/30 bg-card',
  warning: 'border-status-warning/30 bg-card',
  info: 'border-status-info/30 bg-card',
};

export const Toast: React.FC<ToastProps> = ({
  type = 'info',
  title,
  message,
  onClose,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`flex items-start justify-between p-3.5 rounded-md border shadow-card max-w-sm w-full ${borderMap[type]} ${className}`}
    >
      <div className="flex items-start space-x-2.5">
        <div className="mt-0.5">{iconMap[type]}</div>
        <div>
          <h4 className="text-xs font-bold text-text-primary">{title}</h4>
          {message && <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{message}</p>}
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary p-0.5 rounded ml-2"
          aria-label="Dismiss alert"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
