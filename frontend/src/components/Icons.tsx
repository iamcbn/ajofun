export interface IconProps {
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}

function SvgBase({
  className = 'h-4 w-4',
  'aria-hidden': ariaHidden = true,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden}
    >
      {children}
    </svg>
  );
}

export function GiftIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
    </SvgBase>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </SvgBase>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </SvgBase>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </SvgBase>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </SvgBase>
  );
}

export function UserXIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="17" y1="8" x2="22" y2="13" />
      <line x1="22" y1="8" x2="17" y2="13" />
    </SvgBase>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </SvgBase>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </SvgBase>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </SvgBase>
  );
}

export function MessageSquareIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </SvgBase>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </SvgBase>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </SvgBase>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <polyline points="20 6 9 17 4 12" />
    </SvgBase>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </SvgBase>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </SvgBase>
  );
}

export function ShuffleIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </SvgBase>
  );
}

export function RotateCcwIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </SvgBase>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="m6 9 6 6 6-6" />
    </SvgBase>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="m18 15-6-6-6 6" />
    </SvgBase>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </SvgBase>
  );
}

export function SpinnerIcon({
  className = 'h-4 w-4',
  'aria-hidden': ariaHidden = true,
}: IconProps) {
  const cleanClass = className.replace(/\banimate-spin\b/g, '').trim();
  const finalClass = `${cleanClass} motion-safe:animate-spin`.trim();
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={finalClass}
      aria-hidden={ariaHidden}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.25"
        className="opacity-25 motion-reduce:opacity-60"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        className="motion-reduce:hidden"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        fill="currentColor"
        className="hidden motion-reduce:block"
      />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </SvgBase>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </SvgBase>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </SvgBase>
  );
}

export function ShieldAlertIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </SvgBase>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </SvgBase>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </SvgBase>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </SvgBase>
  );
}
