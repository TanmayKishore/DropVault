import React from 'react';
import Link from 'next/link';
import {
  UploadCloud,
  Share2,
  Trash2,
  Lock,
  Clock,
  Shield,
  FileCheck2,
  HardDrive,
  KeyRound,
  ArrowRight,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { UploadWorkflow } from '@/components/upload/UploadWorkflow';
import { Card } from '@/components/ui/Card';

export default function Home() {
  return (
    <main className="min-h-screen bg-background flex flex-col justify-between text-text-primary">
      {/* Navbar */}
      <Navbar />

      {/* Hero Section with Direct Upload Experience */}
      <section className="relative pt-12 pb-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full text-center">
        {/* Subtle Pill */}
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-surface border border-border text-text-secondary text-xs font-semibold mb-6">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span>Anonymous uploads &le; 1 GiB &bull; Authenticated &le; 10 GiB</span>
        </div>

        {/* Hero Headlines */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-text-primary leading-tight sm:leading-none">
          Share files. <span className="text-accent">Not permanently.</span>
        </h1>

        <p className="mt-4 text-base sm:text-xl text-text-secondary max-w-xl mx-auto">
          Simple, secure and temporary file sharing.
        </p>

        {/* Primary Upload Workflow Zone */}
        <div className="mt-10 text-left">
          <UploadWorkflow />
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-16 px-4 sm:px-6 lg:px-8 border-t border-border bg-card/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center space-y-2 mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
              How DropVault Works
            </h2>
            <p className="text-sm text-text-secondary max-w-md mx-auto">
              Three simple steps to exchange files securely with automatic destruction.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center text-accent">
                <UploadCloud className="h-6 w-6 text-accent" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-mono text-accent uppercase font-bold">Step 1</span>
                <h3 className="text-lg font-bold text-text-primary">Upload your file</h3>
                <p className="text-sm text-text-secondary">
                  Drop any file up to 1 GiB anonymously or up to 10 GiB with an account. Streaming buffers guarantee zero memory bottlenecks.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center text-accent">
                <Share2 className="h-6 w-6 text-accent" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-mono text-accent uppercase font-bold">Step 2</span>
                <h3 className="text-lg font-bold text-text-primary">Share the generated link</h3>
                <p className="text-sm text-text-secondary">
                  Distribute your short share link. Add optional Argon2id password protection and set download thresholds at any time.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center text-accent">
                <Trash2 className="h-6 w-6 text-accent" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-mono text-accent uppercase font-bold">Step 3</span>
                <h3 className="text-lg font-bold text-text-primary">Auto-expiry &amp; deletion</h3>
                <p className="text-sm text-text-secondary">
                  Files expire automatically according to your chosen timeframe. Expired storage objects are purged permanently.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security and Privacy Highlights */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center space-y-2 mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
              Security &amp; Privacy Highlights
            </h2>
            <p className="text-sm text-text-secondary max-w-md mx-auto">
              Engineered with defensive access isolation and strict privacy safeguards.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl border border-border bg-card space-y-2.5">
              <HardDrive className="h-5 w-5 text-accent" />
              <h4 className="text-sm font-semibold text-text-primary">Private File Storage</h4>
              <p className="text-xs text-text-secondary">
                Storage keys are randomized and partitioned. Raw storage keys are never exposed to public clients.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border bg-card space-y-2.5">
              <Lock className="h-5 w-5 text-accent" />
              <h4 className="text-sm font-semibold text-text-primary">Password Protection</h4>
              <p className="text-xs text-text-secondary">
                Protect sensitive deliveries with Argon2id passcode hashing. Queries never pass passwords in URLs.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border bg-card space-y-2.5">
              <Clock className="h-5 w-5 text-accent" />
              <h4 className="text-sm font-semibold text-text-primary">Configurable Expiry</h4>
              <p className="text-xs text-text-secondary">
                Choose retention from 24 hours to 30 days. Background workers clean up expired files automatically.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border bg-card space-y-2.5">
              <KeyRound className="h-5 w-5 text-accent" />
              <h4 className="text-sm font-semibold text-text-primary">Dual-Token Isolation</h4>
              <p className="text-xs text-text-secondary">
                Public download links are separated from management credentials to eliminate accidental file revocation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="border-t border-border bg-card/60 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-text-secondary gap-4">
          <div className="flex items-center space-x-2">
            <Shield className="h-4 w-4 text-accent" />
            <span className="font-bold text-text-primary tracking-tight">DropVault</span>
            <span className="text-text-muted">&bull;</span>
            <span>Simple, secure and temporary file sharing.</span>
          </div>

          <div className="flex items-center space-x-6 text-text-muted">
            <Link href="#how-it-works" className="hover:text-text-primary transition-colors">
              How it works
            </Link>
            <Link href="/login" className="hover:text-text-primary transition-colors">
              Sign In
            </Link>
            <Link href="/register" className="hover:text-text-primary transition-colors">
              Register
            </Link>
          </div>
        </div>
        <div className="max-w-5xl mx-auto mt-4 pt-4 border-t border-border/40 text-[11px] text-text-muted flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>&copy; {new Date().getFullYear()} DropVault. Minimal, Professional, Modern SaaS.</span>
          <span className="font-mono">Next.js &bull; Express &bull; PostgreSQL &bull; AWS S3</span>
        </div>
      </footer>
    </main>
  );
}
