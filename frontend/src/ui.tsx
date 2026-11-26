import { useEffect, useId, useRef, type ReactNode } from "react";
export type IconName =
  | "grid"
  | "message"
  | "campaign"
  | "box"
  | "key"
  | "users"
  | "settings"
  | "activity"
  | "book"
  | "arrow"
  | "plus"
  | "close"
  | "menu"
  | "logout"
  | "refresh"
  | "search"
  | "check"
  | "copy"
  | "chevron"
  | "shield"
  | "terminal"
  | "phone"
  | "clock"
  | "upload"
  | "alert";
const paths: Record<IconName, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  message: (
    <path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0ZM7 9h10M7 13h7" />
  ),
  campaign: (
    <>
      <path d="m4 10 14-5v14L4 14v-4ZM7 15l1 6h4l-2-5M21 9v6" />
    </>
  ),
  box: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9M7 6l9 5" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="5" />
      <path d="m12 12 9 9M16 16l3-3M18 18l3-3" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a4 4 0 0 1 0 8M21 21v-3a6 6 0 0 0-3-5" />
    </>
  ),
  settings: (
    <>
      <path
        d="m10 3-1 3-3 1-3-1-1 4 2 2v3l-2 2 2 4 3-1 3 1 1 3h4l1-3 3-1 3 1 2-4-2-2v-3l2-2-2-4-3 1-3-1-1-3h-5Z"
        transform="translate(0 -1) scale(.92)"
      />
      <circle cx="11.5" cy="11" r="3" />
    </>
  ),
  activity: <path d="M2 12h5l3-8 4 16 3-8h5" />,
  book: (
    <>
      <path d="M12 5C8 2 5 3 2 4v16c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-6-2-10 1ZM12 5v16" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  logout: <path d="M9 3H4v18h5M9 12h12m-5-5 5 5-5 5" />,
  refresh: <path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5" />,
  search: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="m15 15 6 6" />
    </>
  ),
  check: <path d="m5 12 4 4L20 5" />,
  copy: (
    <>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V3H3v13h5" />
    </>
  ),
  chevron: <path d="m8 4 8 8-8 8" />,
  shield: <path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6" />,
  terminal: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="m6 8 4 4-4 4m7 0h5" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M10 5h4M11 19h2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  upload: <path d="M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5" />,
  alert: (
    <>
      <path d="m12 3 10 18H2L12 3Z" />
      <path d="M12 9v5m0 3v1" />
    </>
  ),
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className="brand" href="#/overview" aria-label="EthioSMS home">
      <span className="brand-symbol">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 6h14M5 12h10M5 18h14"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="square"
          />
        </svg>
      </span>
      <span>
        Ethio<span className="brand-light">SMS</span>
        {!compact && <small>MESSAGING CONSOLE</small>}
      </span>
    </a>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return children ? (
    <div className="notice" role="status">
      <Icon name="alert" />
      <span>{children}</span>
    </div>
  ) : null;
}
export function Empty({
  icon = "box",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={24} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <h2 id={id}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`pill ${tone}`}>
      <i />
      {children}
    </span>
  );
}
export const when = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    timeZone: "Africa/Addis_Ababa",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
