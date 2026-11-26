import React from 'react';

export interface PageContainerProps {
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  className?: string;
}

const maxWidthMap = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  '2xl': 'max-w-[1400px]',
  full: 'max-w-full',
};

export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  maxWidth = 'lg',
  className = '',
}) => {
  return (
    <div className={`w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 ${maxWidthMap[maxWidth]} ${className}`}>
      {children}
    </div>
  );
};
