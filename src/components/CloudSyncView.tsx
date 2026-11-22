import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Copy,
  HardDrive,
  Lock,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import type { CloudSyncState } from '../types/medical';
import { validateWorkspaceKey } from '../utils/textbookEngine';
import { PWAInstallButton } from './PWAInstallButton';

interface CloudSyncViewProps {
  workspaceKey: string;
  syncState: CloudSyncState;
  lastSyncedAt: string | null;
  isOnline: boolean;
  textbookCount: number;
  guideCount: number;
  onSyncNow: () => Promise<void>;
  onSwitchWorkspaceKey: (newKey: string) => Promise<{ message: string; isError?: boolean }>;
}

export const CloudSyncView: React.FC<CloudSyncViewProps> = ({
  workspaceKey,
  syncState,
  lastSyncedAt,
  isOnline,
  textbookCount,
  guideCount,
  onSyncNow,
  onSwitchWorkspaceKey,
}) => {
  const [copied, setCopied] = useState(false);
  const [customKeyInput, setCustomKeyInput] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(workspaceKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleConnectKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusFeedback(null);
    const check = validateWorkspaceKey(customKeyInput);
    if (!check.valid) {
      setKeyError(check.error || 'Invalid Cloud Vault Key.');
      return;
    }
    setKeyError(null);
    setIsLinking(true);
    try {
      const result = await onSwitchWorkspaceKey(customKeyInput);
      if (result.isError) {
        setKeyError(result.message);
      } else {
        setStatusFeedback(result.message);
        setCustomKeyInput('');
      }
    } finally {
      setIsLinking(false);
    }
  };

  const formattedLastSync = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Not yet synced';

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#0F4C81]">
          Cloud Storage &amp; Offline Mode
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Your medical textbooks, page indexes, clinical notes, and MCQ progress are cached locally in IndexedDB for offline access and encrypted at rest in the cloud using AES-256-GCM.
        </p>
      </div>

      {/* Status Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-xs font-bold text-[#0F4C81]">
              <Lock className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
              <span>Encrypted Cloud Vault (AES-256-GCM)</span>
            </span>
            {!isOnline || syncState === 'offline' ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Offline</span>
              </span>
            ) : syncState === 'syncing' ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0284C7]">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Syncing</span>
              </span>
            ) : syncState === 'error' ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sync Retry Needed</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                <span>Cloud Synced</span>
              </span>
            )}
          </div>

          <p className="mt-3 text-xs text-slate-500 font-mono tabular-nums">
            Last cloud backup: {formattedLastSync}
          </p>

          <div className="mt-5">
            <button
              type="button"
              disabled={!isOnline || syncState === 'syncing'}
              onClick={onSyncNow}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#0c3d68] disabled:opacity-50 transition-colors"
            >
              <Cloud className="h-4 w-4" aria-hidden="true" />
              <span>Sync Library to Cloud Now</span>
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-xs font-bold text-[#0F4C81]">
              <HardDrive className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
              <span>On-Device Offline Cache</span>
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
              <span>Offline Ready</span>
            </span>
          </div>

          <p className="mt-3 font-mono text-sm font-semibold text-slate-900 tabular-nums">
            {textbookCount} Textbooks · {guideCount} Study Guides Cached
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Works on subway commutes, hospital wards with weak reception, and airplane mode without local desktop software.
          </p>
        </div>
      </div>

      {/* Cross-Device Sync Key Management */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Cross-Device Cloud Vault Key (Android &amp; Desktop)
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            Copy your personal Cloud Vault Key below and enter it on your Android phone or tablet to securely decrypt and sync your uploaded textbook indexes and study guides across devices.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <code className="max-w-full break-all rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-sm font-semibold tracking-wider text-[#0F4C81]">
              {workspaceKey}
            </code>
            <button
              type="button"
              onClick={handleCopyKey}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              <span>{copied ? 'Copied Key' : 'Copy Vault Key'}</span>
            </button>
          </div>
        </div>

        <hr className="border-slate-200" />

        <form onSubmit={handleConnectKey} noValidate className="max-w-lg">
          <label
            htmlFor="connect-vault-key-input"
            className="block text-sm font-bold text-slate-900 mb-1"
          >
            Link Another Device&apos;s Cloud Vault Key
          </label>
          <p className="text-xs text-slate-500 mb-3">
            Enter a key from another device (for example, <span className="font-mono">MED-8K4P-2X9N</span>) to pull and merge its encrypted study library.
          </p>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              id="connect-vault-key-input"
              type="text"
              value={customKeyInput}
              onChange={(e) => setCustomKeyInput(e.target.value)}
              placeholder="MED-XXXX-XXXX"
              className="flex-1 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm uppercase text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
            />
            <button
              type="submit"
              disabled={isLinking || !isOnline}
              className="min-h-[44px] rounded-lg bg-[#0F4C81] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#0c3d68] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {isLinking ? 'Connecting...' : 'Connect Vault'}
            </button>
          </div>

          {keyError && (
            <p role="alert" className="mt-2.5 text-xs font-medium text-red-700">
              {keyError}
            </p>
          )}
          {statusFeedback && (
            <p role="status" className="mt-2.5 text-xs font-medium text-emerald-800">
              {statusFeedback}
            </p>
          )}
        </form>
      </div>

      {/* Android & Mobile Web Installation */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="text-base font-bold text-slate-900">
            Zero-Install Progressive Web App (Android &amp; iOS)
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            MedAtlas Tutor runs directly in your mobile browser with zero APK or desktop software installation required, or can be added to your Android home screen in one tap.
          </p>
        </div>
        <PWAInstallButton />
      </div>
    </div>
  );
};
