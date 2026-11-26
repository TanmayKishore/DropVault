import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  size?: 'sm' | 'md' | 'lg' | 'xl'; // Alias for maxWidth
}

const maxWidthMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth,
  size = 'md',
}) => {
  const chosenWidth = maxWidth || size;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${maxWidthMap[chosenWidth]} bg-card border border-border rounded-xl shadow-elevated overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150`}
      >
        {(title || description) && (
          <div className="px-6 pt-6 pb-4 border-b border-border flex items-start justify-between">
            <div>
              {title && <h2 className="text-base font-bold text-text-primary">{title}</h2>}
              {description && <p className="text-xs text-text-secondary mt-1">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-surface transition-colors"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
        {footer && (
          <div className="px-6 py-4 bg-surface/40 border-t border-border flex items-center justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
