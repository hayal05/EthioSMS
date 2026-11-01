import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import { Brand, Empty, Icon, Notice, Pill, when, type IconName } from "./ui";
export type Page =
  | "overview"
  | "messages"
  | "campaigns"
  | "applications"
  | "keys"
  | "team"
  | "operations"
  | "settings"
  | "docs";
const pages: {
  id: Page;
  label: string;
  icon: IconName;
  description: string;
  admin?: boolean;
  group: string;
}[] = [
  {
    id: "overview",
    label: "Overview",
    icon: "grid",
    description: "Your messaging workspace, at a glance.",
    group: "Workspace",
  },
  {
    id: "messages",
    label: "Messages",
    icon: "message",
    description: "Send messages and follow their delivery status.",
    group: "Workspace",
  },
  {
    id: "campaigns",
    label: "Campaigns",
    icon: "campaign",
    description: "Reach consenting recipients with reviewed campaigns.",
    group: "Workspace",
  },
  {
    id: "applications",
    label: "Applications",
    icon: "box",
    description: "A dedicated connection for every integration.",
    group: "Workspace",
  },
  {
    id: "keys",
    label: "API keys",
    icon: "key",
    description: "Manage credentials and permissions for your application.",
    group: "Workspace",
  },
  {
    id: "team",
    label: "Team & access",
    icon: "users",
    description: "The right access for everyone in your workspace.",
    admin: true,
    group: "Administration",
  },
  {
    id: "operations",
    label: "Operations",
    icon: "activity",
    description: "Monitor dispatch, queue activity, and transport failures.",
    admin: true,
    group: "Administration",
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings",
    description: "Set the boundaries for your messaging infrastructure.",
    admin: true,
    group: "Administration",
  },
  {
    id: "docs",
    label: "Developer guide",
    icon: "book",
    description: "Connect your ERP or application in a few requests.",
    group: "Resources",
  },
];
interface App {
  id: string;
  name: string;
  enabled: boolean;
}
export function Console({
  admin,
  userLabel,
  onSignOut,
  page,
  onPage,
  applications,
  selected,
  onSelect,
  onRefresh,
  busy,
  children,
}: {
  admin: boolean;
  userLabel: string;
  onSignOut: () => void;
  page: Page;
  onPage: (page: Page) => void;
  applications: App[];
  selected: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState<string | null>(null),
    [modeError, setModeError] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null),
    drawer = useRef<HTMLElement>(null);
  const available = pages.filter((item) => !item.admin || admin),
    current = available.find((item) => item.id === page) ?? pages[0];
  useEffect(() => {
    const navigate = () => {
      const item = available.find((item) => `#/${item.id}` === location.hash);
      onPage(item?.id ?? "overview");
      setOpen(false);
    };
    navigate();
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, [admin]);
  useEffect(() => {
    void api("/dashboard/config")
      .then((result) => setMode(result.mode))
      .catch(() => setModeError(true));
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawer.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
      if (event.key === "Tab") {
        const items = drawer.current?.querySelectorAll<HTMLElement>("a,button");
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="console">
      <a
        className="skip-link"
        href="#content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("content")?.focus();
        }}
      >
        Skip to content
      </a>
      {open && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => {
            setOpen(false);
            toggle.current?.focus();
          }}
        />
      )}
      <aside
        ref={drawer}
        id="navigation"
        className={`sidebar ${open ? "is-open" : ""}`}
      >
        <Brand compact />
        <nav aria-label="Main navigation">
          {["Workspace", "Administration", "Resources"].map((group) => (
            <div className="nav-group" key={group}>
              {available.some((item) => item.group === group) && (
                <span className="nav-label">{group}</span>
              )}
              {available
                .filter((item) => item.group === group)
                .map((item) => (
                  <a
                    key={item.id}
                    href={`#/${item.id}`}
                    aria-current={page === item.id ? "page" : undefined}
                    className={page === item.id ? "active" : ""}
                    onClick={() => {
                      onPage(item.id);
                      setOpen(false);
                    }}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </a>
                ))}
            </div>
          ))}
        </nav>
        <div className="user-profile">
          <span className="avatar">{userLabel.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong title={userLabel}>{userLabel}</strong>
            <small>{admin ? "Master admin" : "Workspace member"}</small>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            disabled={busy}
            onClick={onSignOut}
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            ref={toggle}
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="navigation"
            onClick={() => setOpen(!open)}
          >
            <Icon name="menu" />
          </button>
          <div className="workspace-label">
            <Icon name="box" />
            <span>Workspace</span>
            <span className="slash">/</span>
          </div>
          <label className="context-select">
            <span className="sr-only">Active application</span>
            <select
              disabled={busy}
              value={selected}
              onChange={(event) => onSelect(event.target.value)}
            >
              <option value="">Select application</option>
              {applications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                  {app.enabled ? "" : " · disabled"}
                </option>
              ))}
            </select>
          </label>
          <div className="topbar-right">
            <Pill tone={mode === "live" ? "green" : "neutral"}>
              {mode === "live"
                ? "Live SMS"
                : mode === "mock"
                  ? "Test mode"
                  : modeError
                    ? "Mode unavailable"
                    : "Checking mode"}
            </Pill>
            <button
              className="icon-button"
              aria-label="Refresh workspace"
              disabled={busy}
              onClick={onRefresh}
            >
              <Icon name="refresh" />
            </button>
          </div>
        </header>
        <main id="content" tabIndex={-1} className="content">
          <div className="page-heading">
            <div>
              <div className="breadcrumb">
                {current.group}
                <Icon name="chevron" size={12} />
                <span>{current.label}</span>
              </div>
              <h1>{current.label}</h1>
              <p>{current.description}</p>
            </div>
            <span className="page-icon">
              <Icon name={current.icon} size={24} />
            </span>
          </div>
          {children}
          <footer className="console-footer">
            <span>
              EthioSMS <span> / </span> Messaging console
            </span>
            <span>Times shown in Addis Ababa · UTC+3</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
export function Overview({
  applicationsLoaded,
  refreshToken,
  applications,
  selected,
  keys,
  usage,
  onPage,
}: {
  refreshToken: number;
  applicationsLoaded: boolean;
  applications: App[];
  selected: string;
  keys: { revoked_at: string | null }[];
  usage: {
    application_remaining: number;
    tenant_remaining: number;
    date: string;
  } | null;
  onPage: (page: Page) => void;
}) {
  const [rows, setRows] = useState<any[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError("");
    if (selected)
      void api(
        `/dashboard/messages?applicationId=${encodeURIComponent(selected)}&limit=6`,
      )
        .then((result) => {
          if (!cancelled) setRows(result.messages);
        })
        .catch((error) => {
          if (!cancelled) setError(error.message);
        });
    return () => {
      cancelled = true;
    };
  }, [selected, refreshToken]);
  const go = (page: Page) => {
    location.hash = `/${page}`;
    onPage(page);
  };
  return (
    <>
      <div className="overview-banner">
        <div>
          <span className="eyebrow">YOUR MESSAGING CONTROL PLANE</span>
          <h2>Good connections start here.</h2>
          <p>Bring your applications and SMS workflows together.</p>
        </div>
        <button onClick={() => go("messages")}>
          <Icon name="plus" /> New message
        </button>
      </div>
      <div className="metrics">
        {[
          {
            label: "Applications",
            value: applicationsLoaded ? applications.length : "—",
            detail: applicationsLoaded
              ? `${applications.filter((app) => app.enabled).length} enabled`
              : "Loading applications",
            icon: "box",
          },
          {
            label: "Active API keys",
            value:
              selected && usage
                ? keys.filter((key) => !key.revoked_at).length
                : "—",
            detail: "Selected application",
            icon: "key",
          },
          {
            label: "Application budget",
            value: usage?.application_remaining.toLocaleString() ?? "—",
            detail: "Segments remaining today",
            icon: "message",
          },
          {
            label: "Account budget",
            value: usage?.tenant_remaining.toLocaleString() ?? "—",
            detail: "Segments remaining today",
            icon: "activity",
          },
        ].map((item) => (
          <article className="metric" key={item.label}>
            <div>
              <span>{item.label}</span>
              <Icon name={item.icon as IconName} />
            </div>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </article>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent messages</h2>
            <p>Latest activity for the selected application</p>
          </div>
          <button className="secondary" onClick={() => go("messages")}>
            View messages <Icon name="arrow" size={14} />
          </button>
        </div>
        <Notice>{error}</Notice>
        {!selected ? (
          <Empty
            icon="message"
            title="Your workspace is ready"
            action={
              <button onClick={() => go("applications")}>
                Add an application <Icon name="arrow" size={14} />
              </button>
            }
          >
            Create an application to connect your ERP or service.
          </Empty>
        ) : rows === null ? (
          <p className="loading" role="status">
            {error
              ? "Message activity is unavailable."
              : "Loading message activity…"}
          </p>
        ) : !rows.length ? (
          <Empty
            icon="message"
            title="Start the conversation"
            action={
              <button onClick={() => go("messages")}>
                Send your first message
              </button>
            }
          >
            Your application’s message activity will appear here.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Message ID</th>
                  <th>Status</th>
                  <th>Segments</th>
                  <th>Mode</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <code>{row.id.slice(0, 12)}…</code>
                    </td>
                    <td>
                      <span className={`state ${row.status}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>{row.totalSegments}</td>
                    <td>{row.mode}</td>
                    <td>{when(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="resource-grid">
        <button className="resource-card" onClick={() => go("keys")}>
          <span className="resource-icon">
            <Icon name="key" />
          </span>
          <div>
            <h3>Connect an application</h3>
            <p>Create a scoped API key for your next integration.</p>
          </div>
          <Icon name="arrow" />
        </button>
        <button className="resource-card" onClick={() => go("docs")}>
          <span className="resource-icon">
            <Icon name="terminal" />
          </span>
          <div>
            <h3>Build with EthioSMS</h3>
            <p>Explore the API and make your first request.</p>
          </div>
          <Icon name="arrow" />
        </button>
      </div>
    </>
  );
}
export function Docs() {
  return (
    <>
      <section className="accounts">
        <div className="section-kicker">
          <Icon name="terminal" /> QUICKSTART
        </div>
        <h2>From your app to a message</h2>
        <p>
          Create an application, have it enabled by an administrator, then issue
          an API key with <code>messages:send</code> permission. Keep the key in
          your server configuration.
        </p>
        <div className="code-window">
          <div>
            <span>HTTP REQUEST</span>
            <span>Example</span>
          </div>
          <pre>{`curl -X POST '${location.origin}/api/v1/messages' \\\n  -H 'Authorization: Bearer YOUR_API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Idempotency-Key: YOUR_UNIQUE_REQUEST_ID' \\\n  -d '{"to":"+251911000000","message":"Hello from your app"}'`}</pre>
        </div>
        <p className="form-hint">
          A queued or accepted response is not delivery confirmation. Follow the
          message status using the API. Reuse the same idempotency key when
          retrying the same request.
        </p>
      </section>
      <section className="accounts">
        <h2>Integration reference</h2>
        <div className="doc-links">
          <a
            href="https://github.com/hayal05/EthioSMS/tree/main/docs"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="book" /> API and deployment documentation{" "}
            <Icon name="arrow" />
          </a>
          <a
            href="https://github.com/hayal05/EthioSMS"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="box" /> EthioSMS source repository <Icon name="arrow" />
          </a>
        </div>
      </section>
    </>
  );
}
