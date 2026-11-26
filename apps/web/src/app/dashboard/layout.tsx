'use client';

import React from 'react';
import { RouteGuard } from '@/components/auth/RouteGuard';
import { Navbar } from '@/components/Navbar';
import { DashboardSidebar } from '@/components/layout/DashboardSidebar';
import { UserVaultProvider } from '@/contexts/UserVaultContext';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard>
      <UserVaultProvider>
        <div className="min-h-screen bg-background text-text-primary flex flex-col">
          <Navbar />
          <div className="flex-1 flex max-w-7xl mx-auto w-full">
            {/* Desktop Sidebar */}
            <DashboardSidebar className="hidden md:flex flex-shrink-0" />
            {/* Main Content Area */}
            <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </UserVaultProvider>
    </RouteGuard>
  );
}
