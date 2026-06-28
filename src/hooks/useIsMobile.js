import { useState, useEffect } from 'react';

const MOBILE_MAX = 768;   // < 768  → mobile (phone)
const TABLET_MAX = 1200;  // 768..1199 → tablet, >=1200 → desktop

function getDevice() {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < MOBILE_MAX) return 'mobile';
  if (w < TABLET_MAX) return 'tablet';
  return 'desktop';
}

// Backwards-compatible default export: returns boolean (mobile only).
// Existing call sites — `const isMobile = useIsMobile()` — keep working unchanged.
export default function useIsMobile() {
  const [device, setDevice] = useState(getDevice);
  useEffect(() => {
    const h = () => setDevice(getDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return device === 'mobile';
}

// New named export — returns 'mobile' | 'tablet' | 'desktop'
export function useDevice() {
  const [device, setDevice] = useState(getDevice);
  useEffect(() => {
    const h = () => setDevice(getDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return device;
}

// Convenience boolean for tablet-only branching
export function useIsTablet() {
  return useDevice() === 'tablet';
}
