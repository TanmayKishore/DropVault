'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Shield, User, LogOut, Menu, X, ArrowRight, LayoutDashboard, HardDrive, Share2, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from './ui/Button';

export const Navbar: React.FC = () => {
  const { user, isLoading, logout, isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/');
    } finally {
      setMobileMenuOpen(false);
    }
  };

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-2.5 group">
          <div className="bg-primary group-hover:bg-primary-hover text-white p-1.5 rounded-md transition-colors shadow-sm">
            <Shield className="h-5 w-5" />
          </div>
          <span className="font-bold text-lg tracking-tight text-text-primary">DropVault</span>
          <span className="text-[11px] px-2 py-0.5 font-semibold rounded bg-surface border border-border text-accent">
            Secure Vault
          </span>
        </Link>

        {/* Desktop Nav Controls */}
        <div className="hidden md:flex items-center space-x-3">
          {isLoading ? (
            <div className="h-8 w-24 bg-surface rounded animate-pulse" />
          ) : isAuthenticated && user ? (
            <div className="flex items-center space-x-3">
              <Link
                href="/dashboard"
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                  pathname.startsWith('/dashboard')
                    ? 'bg-accent/15 text-accent font-semibold'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface'
                }`}
              >
                Dashboard
              </Link>
              <div className="flex items-center space-x-2 text-xs text-text-secondary bg-surface border border-border px-3 py-1.5 rounded-md">
                <User className="h-3.5 w-3.5 text-accent" />
                <span className="font-medium text-text-primary">{user.email}</span>
                <span className="text-[10px] text-text-muted px-1 bg-card rounded">({user.role})</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                leftIcon={<LogOut className="h-3.5 w-3.5" />}
              >
                Sign out
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="primary" size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  Get started
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex md:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-text-secondary hover:text-text-primary p-2 rounded-md hover:bg-surface transition-colors"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-card px-4 pt-4 pb-6 space-y-4 animate-in slide-in-from-top-2 duration-150">
          {isAuthenticated && user ? (
            <div className="space-y-3">
              <div className="flex items-center space-x-2 text-xs text-text-secondary bg-surface p-3 rounded-md border border-border">
                <User className="h-4 w-4 text-accent" />
                <div className="min-w-0">
                  <p className="font-medium text-text-primary truncate">{user.email}</p>
                  <p className="text-[10px] text-text-muted">Role: {user.role}</p>
                </div>
              </div>

              {/* Mobile Dashboard Navigation Links */}
              <nav className="space-y-1 pt-1 pb-2 border-b border-border">
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    pathname === '/dashboard'
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                  }`}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Overview</span>
                </Link>
                <Link
                  href="/dashboard/files"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    pathname === '/dashboard/files'
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                  }`}
                >
                  <HardDrive className="h-4 w-4" />
                  <span>My Files</span>
                </Link>
                <Link
                  href="/dashboard/shares"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    pathname === '/dashboard/shares'
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                  }`}
                >
                  <Share2 className="h-4 w-4" />
                  <span>Share Links</span>
                </Link>
                <Link
                  href="/dashboard/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    pathname === '/dashboard/settings'
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                  }`}
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </Link>
              </nav>

              <Button
                variant="danger"
                size="md"
                onClick={handleLogout}
                leftIcon={<LogOut className="h-4 w-4" />}
                className="w-full justify-start"
              >
                Sign out
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="secondary" size="md" className="w-full">
                  Sign in
                </Button>
              </Link>
              <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="primary" size="md" className="w-full">
                  Get started
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
