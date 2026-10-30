/** Check long-lived installed apps too, without reloading an unfinished study. */
export function watchPwaUpdates(registration: ServiceWorkerRegistration, notifyWaiting: () => void) {
  let checking = false;
  const check = async () => {
    if (document.visibilityState === 'hidden' || !navigator.onLine || checking) return;
    if (registration.waiting) { notifyWaiting(); return; }
    if (registration.installing) return;
    checking = true;
    try { await registration.update(); }
    catch { /* Offline/interrupted updates are retried on the next event. */ }
    finally { checking = false; }
  };
  const onEvent = () => { void check(); };
  const interval = window.setInterval(onEvent, 60_000);
  window.addEventListener('focus', onEvent);
  window.addEventListener('online', onEvent);
  document.addEventListener('visibilitychange', onEvent);
  onEvent();
  return () => {
    window.clearInterval(interval);
    window.removeEventListener('focus', onEvent);
    window.removeEventListener('online', onEvent);
    document.removeEventListener('visibilitychange', onEvent);
  };
}
