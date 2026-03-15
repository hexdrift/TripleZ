interface IconProps {
  size?: number;
  className?: string;
}

const defaults = { size: 20, className: "" };

function svg(size: number, className: string, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconZzz({ size = 22, className = "" }: IconProps) {
  return svg(size, className, <>
    <path d="M4 12h5l-5 5h5" strokeWidth="2.5" />
    <path d="M9 3h6l-6 6h6" strokeWidth="2.8" />
    <path d="M16 8h5l-5 5h5" strokeWidth="2.5" />
  </>);
}

export function IconLayoutDashboard({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </>);
}

export function IconUsers({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>);
}

export function IconBuilding({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <path d="M9 22v-4h6v4" />
    <path d="M8 6h.01" />
    <path d="M16 6h.01" />
    <path d="M12 6h.01" />
    <path d="M12 10h.01" />
    <path d="M12 14h.01" />
    <path d="M16 10h.01" />
    <path d="M16 14h.01" />
    <path d="M8 10h.01" />
    <path d="M8 14h.01" />
  </>);
}

export function IconBed({ size, className }: IconProps = defaults) {
  return (
    <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 50 50" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className={className ?? ""} aria-hidden="true">
      <path d="M 6.97,16.57 C 6.23,16.57 5.63,17.27 5.67,17.79 V 20.45 H 18 V 16.57 Z"/>
      <path d="M 5.67,21.71 V 28.36 H 47.99 V 24.33 C 47.99,22.88 46.89,21.71 45.69,21.71 Z"/>
      <path d="M 0.73,9.58 V 41.52 H 4.34 V 34.92 H 45.53 V 41.52 H 49.36 V 29.53 H 4.34 V 9.58 Z"/>
    </svg>
  );
}

export function IconDoor({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" />
    <path d="M2 20h20" />
    <path d="M14 12v.01" />
  </>);
}

export function IconUserPlus({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="19" y1="8" x2="19" y2="14" />
    <line x1="22" y1="11" x2="16" y2="11" />
  </>);
}

export function IconUserMinus({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="22" y1="11" x2="16" y2="11" />
  </>);
}

export function IconRefresh({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M3 21v-5h5" />
  </>);
}

export function IconChevronLeft({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <path d="M15 18l-6-6 6-6" />);
}

export function IconChevronRight({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <path d="M9 18l6-6-6-6" />);
}

export function IconChevronDown({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <path d="M6 9l6 6 6-6" />);
}

export function IconMenu({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </>);
}

export function IconX({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>);
}

export function IconSearch({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </>);
}

export function IconAlertCircle({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </>);
}

export function IconCheck({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <polyline points="20 6 9 17 4 12" />);
}

export function IconMoon({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />);
}

export function IconSun({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" /><path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" /><path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
  </>);
}

export function IconFilter({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />);
}

export function IconHash({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <line x1="10" y1="3" x2="8" y2="21" />
    <line x1="16" y1="3" x2="14" y2="21" />
  </>);
}

export function IconArrowUpDown({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="m8 3-4 4 4 4" />
    <path d="M4 7h12" />
    <path d="m16 21 4-4-4-4" />
    <path d="M20 17H8" />
  </>);
}

export function IconArrowUp({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="m18 15-6-6-6 6" />
  </>);
}

export function IconArrowDown({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="m6 9 6 6 6-6" />
  </>);
}

export function IconClock({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </>);
}

export function IconSignal({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="M4 20h.01" />
    <path d="M8 20v-4" />
    <path d="M12 20v-8" />
    <path d="M16 20V8" />
    <path d="M20 20V4" />
  </>);
}

export function IconUpload({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </>);
}

export function IconBedOff({ size, className }: IconProps = defaults) {
  return (
    <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 50 50" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className={className ?? ""} aria-hidden="true">
      <path d="M 45.69,21.71 H 29.88 L 27.32,25 L 29.88,28.36 H 47.99 V 24.33 C 47.99,22.88 46.89,21.71 45.69,21.71 Z"/>
      <path d="M 6.97,16.57 C 6.23,16.57 5.63,17.27 5.67,17.79 V 20.45 H 16.81 L 12.76,16.57 H 6.97 Z"/>
      <path d="M 5.67,21.71 V 28.36 H 17.98 L 21.19,25 L 17.98,21.71 H 5.67 Z"/>
      <path d="M 0.73,9.58 V 41.52 H 4.34 V 34.92 H 11.39 L 16.57,29.53 H 4.34 V 9.58 H 0.73 Z"/>
      <path d="M 33.43,29.56 L 38.54,34.92 H 45.53 V 41.52 H 49.36 V 29.56 H 33.43 Z"/>
      <path d="M 18.79,34.92 H 31.12 L 24.86,29.53 H 23.96 L 18.79,34.92 Z"/>
      <path d="M 24.86,29.42 V 34.92 H 31.12 L 24.86,28.61 V 29.42 Z"/>
      <path d="M 37.75,8.43 L 24.86,21.2 L 12.16,8.41 L 8.35,12.09 L 21.19,25 L 8.38,37.88 L 12.16,41.64 L 24.86,28.61 L 37.77,41.64 L 41.62,37.79 L 28.66,25 L 41.64,12.12 L 37.75,8.43 Z"/>
    </svg>
  );
}

export function IconDownload({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </>);
}

export function IconPercent({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <line x1="19" y1="5" x2="5" y2="19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </>);
}

export function IconSwap({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="m16 3 4 4-4 4" />
    <path d="M20 7H4" />
    <path d="m8 21-4-4 4-4" />
    <path d="M4 17h16" />
  </>);
}

export function IconSettings({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>);
}

export function IconPlus({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </>);
}

export function IconTrash({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>);
}

export function IconLogout({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </>);
}

export function IconLock({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </>);
}

export function IconEye({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="3" />
  </>);
}

export function IconEyeOff({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="M3 3l18 18" />
    <path d="M10.6 10.6A3 3 0 0 0 13.4 13.4" />
    <path d="M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.3 17.3 0 0 1-4 4.9" />
    <path d="M6.7 6.7C4.5 8 3 10.2 2 12c0 0 3.5 7 10 7 1.7 0 3.2-.4 4.5-1" />
  </>);
}

export function IconGender({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <circle cx="10" cy="8" r="5" />
    <path d="M15 3l4 0" />
    <path d="M19 3l0 4" />
    <path d="M15.5 7.5l3.5 -4.5" />
    <path d="M10 13v8" />
    <path d="M7 18h6" />
  </>);
}

export function IconMale({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <circle cx="10" cy="14" r="5" />
    <path d="M19 5l-5.4 5.4" />
    <path d="M15 5h4v4" />
  </>);
}

export function IconFemale({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <circle cx="12" cy="9" r="5" />
    <path d="M12 14v7" />
    <path d="M9 18h6" />
  </>);
}

export function IconCrown({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="M12 6l4 6 5 -4 -2 10H5L3 8l5 4z" />
  </>);
}

export function IconMove({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <path d="M5 9l-3 3 3 3" />
    <path d="M9 5l3-3 3 3" />
    <path d="M15 19l3 3-3 3" />
    <path d="M19 9l3 3-3 3" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </>);
}

export function IconCopy({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>);
}

export function IconClipboardList({ size, className }: IconProps = defaults) {
  return svg(size ?? 20, className ?? "", <>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M12 11h4" /><path d="M12 16h4" />
    <path d="M8 11h.01" /><path d="M8 16h.01" />
  </>);
}
