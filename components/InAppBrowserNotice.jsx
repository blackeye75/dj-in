'use client';

import { useEffect, useState } from 'react';
import { inAppBrowser } from '@/lib/player';

/**
 * In-app browsers (Instagram, Facebook, Messenger…) run a stripped WebView
 * with tighter media rules than the real browser, and iOS additionally mutes
 * HTML audio when the ringer switch is off. Priming the audio element on the
 * first gesture fixes most cases, but not all — so tell people where the
 * "open in browser" escape hatch is instead of leaving them with silence.
 */
export default function InAppBrowserNotice() {
  const [app, setApp] = useState('');
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const name = inAppBrowser();
    if (!name) return;
    setApp(name);
    setDismissed(sessionStorage.getItem('dj-in-iab-notice') === 'hidden');
  }, []);

  if (!app || dismissed) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 px-3 pt-3">
      <div className="mx-auto max-w-lg panel px-3 py-2.5 flex items-start gap-3">
        <span className="text-base leading-none mt-0.5">🔊</span>
        <p className="text-[11px] leading-relaxed text-white/70 flex-1">
          You&apos;re in {app}&apos;s built-in browser, which limits audio. If tracks stay silent, tap the{' '}
          <strong className="text-white/90">···</strong> menu and choose{' '}
          <strong className="text-white/90">Open in browser</strong>.
          <span className="block text-white/40 mt-0.5">On iPhone, also check the ringer switch isn&apos;t on silent.</span>
        </p>
        <button
          type="button"
          aria-label="Dismiss"
          className="text-white/40 hover:text-white px-2 py-1 flex-none"
          onClick={() => {
            setDismissed(true);
            sessionStorage.setItem('dj-in-iab-notice', 'hidden');
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
