/**
 * PWA install state for the About tab's "Install as an app" section.
 *
 * Chromium browsers fire `beforeinstallprompt` once, early in page load, when the
 * manifest and service worker meet their install criteria. The About tab is
 * lazy-loaded long after that, so the listener is registered when this module is
 * first imported - main.js imports it at startup for exactly that reason - and the
 * event is kept in module scope until the user asks to install.
 *
 * Safari and Firefox never fire the event; the About tab falls back to manual
 * steps for them.
 */

import { ref, shallowRef } from 'vue'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** The deferred prompt; null until the browser offers one, or after it is used. */
const deferredPrompt = shallowRef<InstallPromptEvent | null>(null)
/** True when running as the installed app, or once installation succeeds. */
const isInstalled = ref(false)

if (typeof window !== 'undefined') {
  isInstalled.value =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true

  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the browser's own mini-infobar quiet; the About tab offers the install.
    e.preventDefault()
    deferredPrompt.value = e as InstallPromptEvent
  })

  window.addEventListener('appinstalled', () => {
    isInstalled.value = true
    deferredPrompt.value = null
  })
}

/** The browser family, for picking which manual install steps to show. */
function detectPlatform(): 'ios' | 'android' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

export function useInstallPrompt() {
  /** Show the browser's install dialog. A prompt can only be used once. */
  async function promptInstall() {
    const event = deferredPrompt.value
    if (!event) return
    deferredPrompt.value = null
    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === 'accepted') isInstalled.value = true
  }

  return { deferredPrompt, isInstalled, promptInstall, platform: detectPlatform() }
}
