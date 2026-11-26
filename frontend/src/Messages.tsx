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
    <section className="operations">
      <div className="operations-intro">
        <div>
          <span className="eyebrow">SYSTEM ADMINISTRATION</span>
          <h2>Operations</h2>
          <p>Monitor gateway configuration, dispatch activity and message failures.</p>
        </div>
        {data && (
          <span className="operations-updated">
            <Icon name="clock" size={14} /> Times shown in Addis Ababa
          </span>
        )}
      </div>
      {data ? (
        <>
          <section className="operations-summary" aria-label="Dispatch summary">
            <article>
              <span>Transport mode</span>
              <strong>{data.mode === "live" ? "Live SMS" : "Test mode"}</strong>
              <small>{data.mode === "live" ? "Live transport selected" : "Messages use mock transport"}</small>
            </article>
            <article>
              <span>Dispatch</span>
              <strong className={data.paused ? "operations-value-muted" : "operations-value-good"}>
                {data.paused ? "Paused" : "Running"}
              </strong>
              <small>{data.paused ? "Pending work is not being dispatched" : "Queue processing is enabled"}</small>
            </article>
            <article>
              <span>Reserved segments</span>
              <strong>{data.usage.reserved_segments.toLocaleString()}</strong>
              <small>Currently reserved</small>
            </article>
            <article>
              <span>Used segments</span>
              <strong>{data.usage.used_segments.toLocaleString()}</strong>
              <small>Recorded usage</small>
            </article>
          </section>

          <section className="panel operations-gateway" aria-labelledby="android-gateway-heading">
            <div className="panel-heading">
              <div>
                <h2 id="android-gateway-heading">Android SMS gateway</h2>
                <p>Gateway configuration and latest API contact</p>
              </div>
              <span className={"state " + (data.mode === "live" ? "accepted" : "unknown")}>
                {data.mode === "live" ? "Live gateway" : "Mock gateway"}
              </span>
            </div>

            <div className="operations-connection">
              <div>
                <span>Device connection</span>
                <strong className="operations-value-muted">Not verified</strong>
                <small>No device heartbeat is available</small>
              </div>
              <div>
                <span>Last successful API contact</span>
                <strong>{data.lastApiContact ? when(data.lastApiContact) : "Never recorded"}</strong>
                <small>Most recent successful gateway API request</small>
              </div>
            </div>

            <p className="operations-explanation">
              An API contact confirms that EthioSMS reached the gateway API during a message
              operation. It does not confirm that the Android app is online, the phone has
              network service, or the selected SIM can send SMS.
            </p>

            <div className="operations-config-grid">
              <article>
                <span>Device ID</span>
                <strong className="gateway-device-id">{data.gateway?.deviceId ?? "Not configured"}</strong>
                <small>{data.gateway?.configured ? "Configured in service environment" : "Live device configuration unavailable"}</small>
              </article>
              <article>
                <span>Selected SIM</span>
                <strong>{data.gateway?.sim ?? "—"}</strong>
                <small>Configured SIM slot</small>
              </article>
              <article>
                <span>SMS sending</span>
                <strong>{data.gateway?.smsEnabled ? "Enabled" : "Disabled"}</strong>
                <small>Service environment flag</small>
              </article>
              <article>
                <span>Live approval</span>
                <strong>{data.gateway?.liveApproved ? "Approved" : "Not approved"}</strong>
                <small>{data.gateway?.allowlistCount ?? 0} pilot recipient(s) allowlisted</small>
              </article>
            </div>
          </section>

          <section className="operations-section" aria-labelledby="dispatch-controls-heading">
            <div className="operations-section-heading">
              <div>
                <h2 id="dispatch-controls-heading">Dispatch controls</h2>
                <p>Administrative actions for the existing message queue</p>
              </div>
              <span className={data.paused ? "operations-control-state is-paused" : "operations-control-state"}>
                {data.paused ? "Dispatch paused" : "Dispatch running"}
              </span>
            </div>
            <div className="operations-actions">
              <button
                disabled={busy}
                className={data.paused ? "" : "secondary"}
                onClick={() => void action("/admin/dispatch", { paused: !data.paused })}
              >
                {data.paused ? "Resume dispatch" : "Pause dispatch"}
              </button>
              <button className="secondary" disabled={busy} onClick={() => void action("/admin/dispatch/drain")}>
                Process pending work
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void load()
                    .then(() => setNotice(""))
                    .catch((error) => setNotice(error.message))
                    .finally(() => setBusy(false));
                }}
              >
                <Icon name="refresh" size={14} /> Check queue
              </button>
              <button className="secondary" disabled={busy} onClick={() => void action("/admin/maintenance")}>
                Run retention maintenance
              </button>
            </div>
          </section>

          <section className="operations-section" aria-labelledby="queue-activity-heading">
            <div className="operations-section-heading">
              <div>
                <h2 id="queue-activity-heading">Queue activity</h2>
                <p>Recipient counts grouped by their current delivery state</p>
              </div>
            </div>
            <div className="operations-queue-grid">
              {data.counts.length ? (
                data.counts.map((item: any) => (
                  <article className="operations-queue-item" key={item.status}>
                    <span>{item.status}</span>
                    <strong>{item.count.toLocaleString()}</strong>
                    <small>Recipients</small>
                  </article>
                ))
              ) : (
                <div className="operations-queue-empty">
                  <Icon name="check" size={17} />
                  <span>No recipients in the queue</span>
                </div>
              )}
            </div>
          </section>

          <section className="operations-section" aria-labelledby="recent-failures-heading">
            <div className="operations-section-heading">
              <div>
                <h2 id="recent-failures-heading">Recent failures</h2>
                <p>Latest failed or uncertain message recipients</p>
              </div>
              <span className="operations-failure-count">{data.failures.length} recorded</span>
            </div>
            {data.failures.length ? (
              <ul className="operations-failure-list">
                {data.failures.map((item: any) => (
                  <li key={item.id}>
                    <div className="operations-failure-main">
                      <strong>{item.application}</strong>
                      <small>{item.mode} transport</small>
                    </div>
                    <span className={"state " + (item.status === "failed" ? "failed" : "unknown")}>
                      {item.status}
                    </span>
                    <code>{item.last_error_code ?? "No error code"}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="operations-no-failures">
                <Icon name="check" size={17} />
                <span>No recent failures recorded</span>
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="operations-loading" role="status">
          <Icon name={notice ? "alert" : "activity"} size={20} />
          <div>
            <strong>{notice ? "Operations data unavailable" : "Loading operations…"}</strong>
            <p>{notice || "Retrieving the latest gateway and queue information."}</p>
          </div>
          {notice && (
            <button className="secondary" disabled={busy} onClick={() => {
              setBusy(true);
              setNotice("");
              void load().catch((error) => setNotice(error.message)).finally(() => setBusy(false));
            }}>
              Try again
            </button>
          )}
        </div>
      )}
      {notice && data && <p className="operations-feedback" role="status">{notice}</p>}
    </section>
  );
}
