import { useRef, useState } from 'react';
import { createWorkspaceSession } from './workspaceSession.js';

export default function useWorkspaceSession(getPorts) {
  const latest = useRef(getPorts);
  latest.current = getPorts;
  const [session] = useState(() => createWorkspaceSession(() => latest.current()));
  return session;
}
