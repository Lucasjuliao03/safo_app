import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchPwaUpdates } from '@/lib/pwaUpdates';

let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { stop?.(); stop = undefined; vi.restoreAllMocks(); vi.useRealTimers(); });

describe('installed app updates', () => {
  it('checks on startup, focus, reconnect and periodically, with cleanup', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    stop = watchPwaUpdates({ update } as unknown as ServiceWorkerRegistration, vi.fn());
    expect(update).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(4);
    stop();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(update).toHaveBeenCalledTimes(4);
  });
  it('does not start parallel update requests', () => {
    const update = vi.fn().mockReturnValue(new Promise(() => {}));
    stop = watchPwaUpdates({ update } as unknown as ServiceWorkerRegistration, vi.fn());
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('reminds about a waiting update without forcing a reload or losing a draft', () => {
    const update = vi.fn(); const notify = vi.fn();
    stop = watchPwaUpdates({ update, waiting: {} } as unknown as ServiceWorkerRegistration, notify);
    expect(notify).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });
  it('retries a failed update on reconnect and avoids hidden/offline requests', async () => {
    const update = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    stop = watchPwaUpdates({ update } as unknown as ServiceWorkerRegistration, vi.fn());
    await Promise.resolve(); await Promise.resolve();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('focus'));
    expect(update).toHaveBeenCalledTimes(1);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    expect(update).toHaveBeenCalledTimes(2);
    await Promise.resolve(); await Promise.resolve();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    window.dispatchEvent(new Event('focus'));
    expect(update).toHaveBeenCalledTimes(2);
  });
});
