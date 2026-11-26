'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, HardDrive, Share2, Settings, Shield } from 'lucide-react';

export interface SidebarItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
}

export interface DashboardSidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  className = '',
  onNavigate,
}) => {
  const pathname = usePathname();

  const navigation: SidebarItem[] = [
    {
      name: 'Overview',
      href: '/dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      name: 'My Files',
      href: '/dashboard/files',
      icon: <HardDrive className="w-4 h-4" />,
    },
    {
      name: 'Share Links',
      href: '/dashboard/shares',
      icon: <Share2 className="w-4 h-4" />,
    },
    {
      name: 'Settings',
      href: '/dashboard/settings',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  return (
    <aside
      className={`w-64 bg-card border-r border-border min-h-[calc(100vh-4rem)] p-4 flex flex-col justify-between ${className}`}
    >
      <div className="space-y-6">
        <div className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider">
          Vault Dashboard
        </div>
        <nav className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  {item.icon}
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-card border border-border">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-3 bg-surface/50 border border-border/80 rounded-xl">
        <div className="flex items-center space-x-2 text-xs text-text-secondary">
          <Shield className="w-3.5 h-3.5 text-accent" />
          <span className="font-semibold text-text-primary">Dual-Token Vault</span>
        </div>
        <p className="text-[11px] text-text-muted mt-1 leading-tight">
          Isolated file management with automated TTL expiration.
        </p>
      </div>
    </aside>
  );
};
