import { useLayoutEffect, useRef, useState } from 'react';
import { createCombatOverlay, combatOverlayState } from '../../packages/viewer/src/overlays/index.js';

// React owns only the mounting point. Visual layers are shared with standalone.
export default function CombatOverlay({ active, alive, hurt, hurtAgeSeconds, flashOpacity, options }) {
  const [reducedEffects, setReducedEffects] = useState(false);
  const mount = useRef(null), overlay = useRef(null);
  useLayoutEffect(() => {
    overlay.current = createCombatOverlay({ container: mount.current });
    const media = mount.current.ownerDocument.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)');
    const change = () => setReducedEffects(Boolean(media?.matches)); change();
    media?.addEventListener('change', change);
    return () => { media?.removeEventListener('change', change); overlay.current?.dispose(); overlay.current = null; };
  }, []);
  useLayoutEffect(() => { overlay.current?.update(combatOverlayState({ active, alive, hurt, hurtAgeSeconds, flashOpacity }, { reducedEffects, ...options })); }, [active, alive, hurt, hurtAgeSeconds, flashOpacity, options, reducedEffects]);
  return <div ref={mount} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true" />;
}
