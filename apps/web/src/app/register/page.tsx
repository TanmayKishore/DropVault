'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Lock, Mail, User, AlertCircle, ArrowRight, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectDestination = searchParams.get('redirect') || '/';

  const { register, isAuthenticated } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isAuthenticated) {
      router.push(redirectDestination);
    }
  }, [isAuthenticated, router, redirectDestination]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validations matching backend constraints
    if (!email || !email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }

    if (password.length < 10) {
      setError('Password must be at least 10 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);

    try {
      const res = await register(email, password, name || undefined);
      if (res.success) {
        router.push(redirectDestination);
      } else {
        setError(res.error?.message || 'Registration failed');
      }
    } catch {
      setError('Failed to connect to authentication service. Please check your network.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-text-primary">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center space-x-2">
          <div className="bg-primary/20 text-accent p-2.5 rounded-xl border border-primary/30 shadow-glow">
            <Shield className="h-6 w-6 text-accent" />
          </div>
          <span className="font-bold text-2xl tracking-tight text-text-primary">DropVault</span>
        </Link>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-text-primary">Create your account</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card variant="default" className="py-8 px-4 sm:px-10 border-border">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-status-error/10 border border-status-error/30 flex items-start space-x-2 text-status-error text-sm">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-status-error" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input
              label="Full Name (optional)"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Doe"
              leftIcon={<User className="h-4 w-4" />}
              disabled={loading}
              autoComplete="name"
            />

            <Input
              label="Email address"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              leftIcon={<Mail className="h-4 w-4" />}
              disabled={loading}
              autoComplete="email"
            />

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              helperText="Minimum 10 characters required."
              leftIcon={<Lock className="h-4 w-4" />}
              disabled={loading}
              autoComplete="new-password"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-text-muted hover:text-text-primary focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />

            <Input
              label="Confirm Password"
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••"
              leftIcon={<Lock className="h-4 w-4" />}
              disabled={loading}
              autoComplete="new-password"
            />

            <div className="text-xs text-text-muted space-y-1 py-1">
              <div className="flex items-center space-x-1.5">
                <CheckCircle className={`h-3.5 w-3.5 ${password.length >= 10 ? 'text-status-success' : 'text-text-muted'}`} />
                <span className={password.length >= 10 ? 'text-text-secondary' : 'text-text-muted'}>
                  At least 10 characters
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                <CheckCircle
                  className={`h-3.5 w-3.5 ${
                    confirmPassword && confirmPassword === password
                      ? 'text-status-success'
                      : 'text-text-muted'
                  }`}
                />
                <span
                  className={
                    confirmPassword && confirmPassword === password
                      ? 'text-text-secondary'
                      : 'text-text-muted'
                  }
                >
                  Passwords match
                </span>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={loading}
              className="w-full mt-2"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Create Account
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center text-text-primary">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
