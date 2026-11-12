// Iconos de trazo (24×24). Decorativos por defecto: el texto o aria-label del botón describe la acción.
import type { ReactNode } from 'react';

function I({ children, size = 20, sw = 1.8 }: { children: ReactNode; size?: number; sw?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
type P = { size?: number };

export const Sun = (p: P) => <I {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></I>;
export const Cal = (p: P) => <I {...p}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></I>;
export const Spark = (p: P) => <I {...p} sw={1.9}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" /></I>;
export const Folder = (p: P) => <I {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></I>;
export const User = (p: P) => <I {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" /></I>;
export const Bell = (p: P) => <I {...p}><path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 21a2 2 0 0 0 4 0" /></I>;
export const Plus = (p: P) => <I {...p} sw={2.2}><path d="M12 5v14M5 12h14" /></I>;
export const X = (p: P) => <I {...p} sw={2}><path d="M6 6l12 12M18 6L6 18" /></I>;
export const Check = (p: P) => <I {...p} sw={3}><path d="M5 12.5l4.5 4.5L19 7.5" /></I>;
export const Back = (p: P) => <I {...p} sw={2}><path d="M15 6l-6 6 6 6" /></I>;
export const Chevron = (p: P) => <I {...p} sw={2}><path d="M9 6l6 6-6 6" /></I>;
export const Left = (p: P) => <I {...p} sw={2}><path d="M15 6l-6 6 6 6" /></I>;
export const Right = (p: P) => <I {...p} sw={2}><path d="M9 6l6 6-6 6" /></I>;
export const Mic = (p: P) => <I {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></I>;
export const Send = (p: P) => <I {...p} sw={2.2}><path d="M12 19V5M6 11l6-6 6 6" /></I>;
export const Trash = (p: P) => <I {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></I>;
export const Edit = (p: P) => <I {...p}><path d="M4 20l4-1 11-11-3-3L5 16z" /></I>;
export const Clock = (p: P) => <I {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></I>;
export const Pin = (p: P) => <I {...p}><path d="M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></I>;
export const Users = (p: P) => <I {...p}><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2" /><path d="M3 19c1-3 3-4 6-4s5 1 6 4M16 15c2 0 4 1 5 3" /></I>;
export const Cap = (p: P) => <I {...p}><path d="M2 9l10-5 10 5-10 5zM6 11.5V16c2 2 10 2 12 0v-4.5" /></I>;
export const Board = (p: P) => <I {...p}><path d="M4 5h16v11H4zM8 20h8" /></I>;
export const Download = (p: P) => <I {...p} sw={2}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></I>;
export const Upload = (p: P) => <I {...p} sw={2}><path d="M12 20V9M7 14l5-5 5 5M5 4h14" /></I>;
export const Refresh = (p: P) => <I {...p} sw={2}><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4" /></I>;
export const Copy = (p: P) => <I {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></I>;
export const Logo = (p: P) => <I {...p} sw={2}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></I>;
export const Camera = (p: P) => <I {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></I>;
export const List = (p: P) => <I {...p}><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></I>;
