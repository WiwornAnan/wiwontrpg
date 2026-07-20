import { useEffect, useRef, useState } from 'react';

// True while the user is actively using this tab; flips to false when the tab is
// hidden or there's been no interaction for `idleMs`. Live queries multiply it
// into their refetch interval (`refetchInterval: active ? 2000 : false`) so they
// poll snappily during play but stop entirely when a tab is left open idle — the
// main source of wasted DB traffic. One listener set per component that calls it.
export function useIsActive(idleMs = 120_000): boolean {
  const [active, setActive] = useState(true);
  const lastRef = useRef(Date.now());

  useEffect(() => {
    // React bails out when the next state equals the current one, so calling
    // setActive(true) on every mousemove is cheap (no re-render while already active).
    const onActivity = () => { lastRef.current = Date.now(); setActive(true); };
    const onVisibility = () => { if (document.hidden) setActive(false); else onActivity(); };
    const check = () => { if (!document.hidden && Date.now() - lastRef.current >= idleMs) setActive(false); };

    const iv = window.setInterval(check, 20_000);
    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    window.addEventListener('touchstart', onActivity, { passive: true });
    window.addEventListener('click', onActivity);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('touchstart', onActivity);
      window.removeEventListener('click', onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [idleMs]);

  return active;
}
