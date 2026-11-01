import { useEffect, useState } from "react";
import { api } from "./api";
import { Empty, Icon, Modal } from "./ui";
const when = (value: string) =>
  new Date(value).toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa" });
export function Messages({
  applicationId,
  onChanged,
  refreshToken = 0,
}: {
  applicationId: string;
  onChanged?: () => void;
  refreshToken?: number;
}) {
  const [to, setTo] = useState(""),
    [message, setMessage] = useState(""),
    [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [mode, setMode] = useState("");
  const [composing, setComposing] = useState(false);
  const [rows, setRows] = useState<any[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<any>(null);
  const query = `applicationId=${encodeURIComponent(applicationId)}`;
  async function history(next?: string) {
    const result = await api(
      `/dashboard/messages?${query}&limit=10${next ? `&cursor=${encodeURIComponent(next)}` : ""}`,
    );
    setRows((previous) =>
      next ? [...previous, ...result.messages] : result.messages,
    );
    setCursor(result.nextCursor);
  }
  useEffect(() => {
    setRows([]);
    setSelected(null);
    void history().catch((error) => setNotice(error.message));
    void api("/dashboard/config")
      .then((result) => setMode(result.mode))
      .catch(() => {});
  }, [applicationId, refreshToken]);
  return (
    <section className="message-panel">
      <div className="compose-toolbar">
        <h2>
          Message activity{" "}
          <span className="badge">
            {mode === "mock"
              ? "Test mode"
              : mode === "live"
                ? "Live SMS"
                : "Checking mode"}
          </span>
        </h2>
        <button
          onClick={() => {
            setNotice("");
            setComposing(true);
          }}
        >
          <Icon name="plus" /> New message
        </button>
      </div>
      {composing && (
        <Modal
          title="New message"
          description="Queue a message for the selected application."
          onClose={() => setComposing(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setNotice("");
              void api(
                `/dashboard/messages?${query}`,
                "POST",
                { to, message },
                { "Idempotency-Key": requestId },
              )
                .then((result) => {
                  setNotice(
                    `Queued ${result.totalSegments} segment(s). Delivery is not yet confirmed.`,
                  );
                  setMessage("");
                  setComposing(false);
                  setRequestId(crypto.randomUUID());
                  onChanged?.();
                  return history();
                })
                .catch((error) => setNotice(error.message))
                .finally(() => setBusy(false));
            }}
          >
            <label>
              Mobile number
              <input
                required
                value={to}
                placeholder="09… or +251…"
                onChange={(event) => {
                  setTo(event.target.value);
                  setRequestId(crypto.randomUUID());
                }}
              />
            </label>
            <label className="wide">
              Message
              <textarea
                required
                maxLength={1600}
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setRequestId(crypto.randomUUID());
                }}
              />
            </label>
            <p className="form-hint">
              {message.length}/1600 characters · Final segment count is
              calculated by the server.
            </p>
            <button disabled={busy || !mode}>
              {busy
                ? "Submitting…"
                : mode === "mock"
                  ? "Queue test message"
                  : "Queue SMS"}
            </button>
          </form>
          <p role="status">{notice}</p>
        </Modal>
      )}
      <p role="status">{notice}</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Created (Addis Ababa)</th>
              <th>Status</th>
              <th>Segments</th>
              <th>Mode</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{when(row.createdAt)}</td>
                <td>
                  <span className={`state ${row.status}`}>{row.status}</span>
                </td>
                <td>{row.totalSegments}</td>
                <td>{row.mode}</td>
                <td>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void api(`/dashboard/messages/${row.id}?${query}`)
                        .then(setSelected)
                        .catch((error) => setNotice(error.message))
                        .finally(() => setBusy(false));
                    }}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <Empty icon="message" title="No messages yet">
          Queue your first message to see its delivery status here.
        </Empty>
      )}
      {cursor && (
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void history(cursor)
              .catch((error) => setNotice(error.message))
              .finally(() => setBusy(false));
          }}
        >
          Load more
        </button>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void history()
            .catch((error) => setNotice(error.message))
            .finally(() => setBusy(false));
        }}
      >
        Check status
      </button>
      {selected && (
        <Modal title="Message details" onClose={() => setSelected(null)}>
          <code>{selected.id}</code>
          <p>Expires {when(selected.expiresAt)}</p>
          {selected.recipients.map((item: any) => (
            <p key={item.id}>
              {item.to} · {item.status} · {item.segments} segment(s)
              {item.errorCode ? ` · ${item.errorCode}` : ""}
            </p>
          ))}
        </Modal>
      )}
    </section>
  );
}
export function Operations({ refreshToken = 0 }: { refreshToken?: number }) {
  const [data, setData] = useState<any>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => setData(await api("/admin/overview"));
  useEffect(() => {
    void load().catch((error) => setNotice(error.message));
  }, [refreshToken]);
  async function action(path: string, body?: unknown) {
    setBusy(true);
    setNotice("");
    try {
      await api(path, "POST", body);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="accounts">
      <h2>Operations</h2>
      {data ? (
        <>
          <div className="status">
            <span>
              {data.mode === "mock" ? "Mock transport" : "Live transport"} ·{" "}
              {data.paused ? "Paused" : "Running"}
            </span>
            <span>
              Reserved: {data.usage.reserved_segments} · Used:{" "}
              {data.usage.used_segments}
            </span>
          </div>
          <p>
            Last gateway API contact:{" "}
            {data.lastApiContact ? when(data.lastApiContact) : "Not recorded"}.
            Phone connectivity is not confirmed by this value.
          </p>
          <div className="actions">
            <button
              disabled={busy}
              onClick={() =>
                void action("/admin/dispatch", { paused: !data.paused })
              }
            >
              {data.paused ? "Resume dispatch" : "Pause dispatch"}
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void action("/admin/dispatch/drain")}
            >
              Process pending work
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void load()
                  .catch((error) => setNotice(error.message))
                  .finally(() => setBusy(false));
              }}
            >
              Check queue
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void action("/admin/maintenance")}
            >
              Run retention maintenance
            </button>
          </div>
          <div className="metrics queue-metrics">
            {data.counts.length ? (
              data.counts.map((item: any) => (
                <article className="metric" key={item.status}>
                  <div>{item.status}</div>
                  <strong>{item.count}</strong>
                  <small>Recipients in this state</small>
                </article>
              ))
            ) : (
              <p>No recipients in the queue.</p>
            )}
          </div>
          <h3>Recent failures</h3>
          {!data.failures.length && (
            <p className="form-hint">No recent failures recorded.</p>
          )}
          <ul className="user-list">
            {data.failures.map((item: any) => (
              <li key={item.id}>
                {item.application} · {item.mode} · {item.status} ·{" "}
                {item.last_error_code ?? "No error code"}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>Loading operations…</p>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
