import { useEffect, useRef, useState, type ReactNode } from "react";
import { Console, Overview, Docs, type Page } from "./Console";
import { Empty, Notice, Modal, Icon } from "./ui";
import { Campaigns, CampaignReview } from "./Campaigns";
import { Messages, Operations } from "./Messages";
import { api } from "./api";
interface Application {
  id: string;
  name: string;
  enabled: boolean;
  account?: string;
}
interface Key {
  id: string;
  prefix: string;
  scopes: string[];
  revoked_at: string | null;
}
const permissions = [
  "messages:send",
  "messages:read",
  "otp:request",
  "otp:verify",
  "usage:read",
];
const limitLabels: Record<string, string> = {
  global_daily_segments: "Platform segments/day",
  tenant_daily_segments: "Account segments/day",
  application_daily_segments: "Application segments/day",
  key_requests_per_minute: "Requests/key/minute",
  application_requests_per_minute: "Requests/application/minute",
  tenant_requests_per_minute: "Requests/account/minute",
  global_requests_per_minute: "Platform requests/minute",
};
export function Developer({
  admin,
  userLabel,
  onSignOut,
  team,
  accountNotice,
}: {
  accountNotice: string;
  admin: boolean;
  userLabel: string;
  onSignOut: () => void;
  team: ReactNode;
}) {
  const [page, setPageState] = useState<Page>("overview");
  const setPage = (next: Page) => {
    setPageState(next);
    if (location.hash !== `#/${next}`) location.hash = `/${next}`;
  };
  const detailVersion = useRef(0);
  const selectedId = useRef("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [visited, setVisited] = useState<Set<Page>>(new Set());
  useEffect(() => {
    setVisited((previous) => new Set([...previous, page]));
  }, [page]);
  const [applicationsLoaded, setApplicationsLoaded] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]),
    [allApps, setAllApps] = useState<Application[]>([]),
    [name, setName] = useState(""),
    [selected, setSelected] = useState("");
  const [keys, setKeys] = useState<Key[]>([]),
    [scopes, setScopes] = useState([
      "messages:send",
      "messages:read",
      "usage:read",
    ]),
    [issued, setIssued] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [expandedKeyId, setExpandedKeyId] = useState<string | null>(null);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [usage, setUsage] = useState<{
    application_remaining: number;
    tenant_remaining: number;
    date: string;
  } | null>(null);
  const [limits, setLimits] = useState<Record<string, number>>({}),
    [prefixes, setPrefixes] = useState("+251");
  async function refresh() {
    const result = await api("/applications");
    setApplications(result.applications);
    setApplicationsLoaded(true);
    setSelected((current) =>
      result.applications.some((item: Application) => item.id === current)
        ? current
        : (result.applications.find((item: Application) => item.enabled)?.id ??
          result.applications[0]?.id ??
          ""),
    );
    if (admin) {
      setAllApps((await api("/admin/applications")).applications);
      const config = await api("/admin/limits");
      setLimits(
        Object.fromEntries(
          Object.keys(limitLabels).map((key) => [key, config[key]]),
        ),
      );
      setPrefixes(config.allowed_destination_prefixes.join(", "));
    }
  }
  async function details(id: string) {
    if (id !== selectedId.current) return;
    const version = ++detailVersion.current;
    if (!id) return;
    const [result, usageResult] = await Promise.all([
      api(`/applications/${id}/keys`),
      api(`/applications/${id}/usage`),
    ]);
    if (version === detailVersion.current && id === selectedId.current) {
      setKeys(result.keys);
      setUsage(usageResult);
    }
  }
  useEffect(() => {
    void refresh().catch((error) => setNotice(error.message));
  }, [admin]);
  useEffect(() => {
    selectedId.current = selected;
    setIssued("");
    setKeys([]);
    setUsage(null);
    void details(selected).catch((error) => setNotice(error.message));
  }, [selected]);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    setIssued("");
    try {
      await work();
      await refresh();
      await details(selected);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Console
      admin={admin}
      userLabel={userLabel}
      onSignOut={onSignOut}
      page={page}
      onPage={setPage}
      applications={applications}
      selected={selected}
      onSelect={setSelected}
      onRefresh={() => {
        setRefreshToken((value) => value + 1);
        void act(async () => {});
      }}
      busy={busy}
    >
      <Notice>{notice || accountNotice}</Notice>
      {page === "overview" && (
        <Overview
          applicationsLoaded={applicationsLoaded}
          refreshToken={refreshToken}
          applications={applications}
          selected={selected}
          keys={keys}
          usage={usage}
          onPage={setPage}
        />
      )}
      {page === "team" && team}
      {page === "docs" && <Docs />}
      {(page === "applications" || page === "keys" || page === "settings") && (
        <section className="accounts" aria-label="Developer applications">
          {page === "applications" && (
            <>
              <h2>Your applications</h2>
              <p>
                Each integration has its own credentials, usage, and approval
                status.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void act(async () => {
                    await api("/applications", "POST", { name });
                    setName("");
                    setNotice(
                      "Application created. Administrator approval is required before API access.",
                    );
                  });
                }}
              >
                <label>
                  Application name
                  <input
                    required
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <button disabled={busy}>Create application</button>
              </form>
              <ul className="user-list">
                {applications.map((item) => (
                  <li key={item.id}>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.enabled
                          ? "Enabled"
                          : "Disabled / awaiting approval"}
                      </small>
                    </span>
                    <button
                      className="secondary"
                      onClick={() => {
                        setSelected(item.id);
                        setPage("keys");
                      }}
                    >
                      Manage keys
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {page === "keys" && !selected && (
            <Empty title="Create an application first">
              API keys belong to an application. Add one from the Applications
              page.
            </Empty>
          )}
          {page === "keys" && selected && (
            <>
              <div className="keys-heading"><div><span className="keys-eyebrow">APPLICATION SECURITY</span><h2>API keys</h2><p>Create and manage credentials for <strong>{applications.find((item) => item.id === selected)?.name ?? "this application"}</strong>. Each key has its own permissions.</p></div><button disabled={busy} onClick={() => setKeyDialogOpen(true)}><Icon name="key" size={15} /> Create API key</button></div>
              <div className="key-summary"><article><span>Active keys</span><strong>{keys.filter((key) => !key.revoked_at).length}</strong><small>Ready to authenticate</small></article><article><span>Revoked keys</span><strong>{keys.filter((key) => !!key.revoked_at).length}</strong><small>No longer accepted</small></article><article><span>Total issued</span><strong>{keys.length}</strong><small>For this application</small></article></div>
              <div className="key-app-status"><span className={applications.find((item) => item.id === selected)?.enabled ? "key-status-dot is-active" : "key-status-dot"} /><span><strong>{applications.find((item) => item.id === selected)?.enabled ? "Application enabled" : "Application disabled"}</strong><small>API keys are scoped to this application</small></span><button className="secondary" disabled={busy || !applications.find((item) => item.id === selected)?.enabled} onClick={() => void act(async () => { await api("/applications/" + selected, "PATCH", { enabled: false }); })}>Disable application</button></div>
              {usage && <div className="key-usage-note"><Icon name="activity" size={15} /><span><strong>{usage.application_remaining.toLocaleString()}</strong> application segments remaining</span><span>·</span><span><strong>{usage.tenant_remaining.toLocaleString()}</strong> account segments remaining</span><small>{usage.date} · Addis Ababa</small></div>}
              {issued && <div className="key-secret" role="status"><div className="key-secret-heading"><span className="key-secret-icon"><Icon name="shield" /></span><div><strong>Your new API key is ready</strong><small>Copy it now. The full key will not be shown again.</small></div></div><code>{issued}</code><div className="key-secret-actions"><button onClick={() => { void navigator.clipboard.writeText(issued).then(() => setCopiedKey(true)).catch(() => setNotice("Clipboard unavailable. Select and copy the key manually.")); }}><Icon name="copy" size={14} /> {copiedKey ? "Copied" : "Copy API key"}</button><button className="secondary" onClick={() => { setIssued(""); setCopiedKey(false); }}>Hide key</button></div></div>}
              <div className="key-list-heading"><div><h3>Your credentials</h3><p>Only the key prefix is displayed here.</p></div><span>{keys.length} {keys.length === 1 ? "key" : "keys"}</span></div>
              {keys.length ? <div className="key-table-wrap"><table className="key-table"><thead><tr><th scope="col">API key</th><th scope="col">Status</th><th scope="col" className="key-actions-heading">Actions</th></tr></thead><tbody>{keys.map((key) => <><tr className={`${key.revoked_at ? "is-revoked" : ""} ${expandedKeyId === key.id ? "is-expanded" : ""}`} key={key.id} onClick={() => setExpandedKeyId((current) => current === key.id ? null : key.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpandedKeyId((current) => current === key.id ? null : key.id); } }} tabIndex={0} aria-expanded={expandedKeyId === key.id} aria-label={`API key ${key.prefix}, ${key.revoked_at ? "revoked" : "active"}. Click to ${expandedKeyId === key.id ? "hide" : "view"} permissions`}><td data-label="API key"><div className="key-table-identity"><span className="key-item-icon"><Icon name="key" size={16} /></span><code>{key.prefix}••••••</code><span className="key-row-hint">{expandedKeyId === key.id ? "Hide permissions" : "View permissions"}</span></div></td><td data-label="Status"><span className={key.revoked_at ? "key-badge revoked" : "key-badge active"}>{key.revoked_at ? "Revoked" : "Active"}</span></td><td data-label="Actions" onClick={(event) => event.stopPropagation()}><div className="key-item-actions">{!key.revoked_at ? <><button className="secondary" disabled={busy} onClick={() => void act(async () => { const result = await api("/applications/" + selected + "/keys/" + key.id + "/rotate", "POST"); setIssued(result.apiKey); setCopiedKey(false); })}>Rotate</button><button className="key-revoke-button" disabled={busy} onClick={() => { if (window.confirm("Revoke this API key? Integrations using it will stop authenticating.")) void act(async () => { await api("/applications/" + selected + "/keys/" + key.id, "DELETE"); }); }}>Revoke</button></> : <span className="key-no-actions">No actions</span>}</div></td></tr>{expandedKeyId === key.id && <tr className="key-permissions-detail" key={`${key.id}-permissions`}><td colSpan={3}><div className="key-permissions-panel"><strong>Permissions</strong><div className="key-scopes">{key.scopes.length ? key.scopes.map((scope) => <span key={scope}>{scope}</span>) : <small>No permissions assigned</small>}</div></div></td></tr>}</>)}</tbody></table></div> : <Empty icon="key" title="No API keys yet">Create your first key to connect this application to EthioSMS.</Empty>}
              {keyDialogOpen && <Modal title="Create an API key" description="Choose only the permissions this integration needs." onClose={() => setKeyDialogOpen(false)}><form className="key-create-form" onSubmit={(event) => { event.preventDefault(); void act(async () => { const result = await api("/applications/" + selected + "/keys", "POST", { scopes }); setIssued(result.apiKey); setCopiedKey(false); setKeyDialogOpen(false); }); }}><div className="key-create-context"><span><Icon name="box" size={16} /></span><div><small>APPLICATION</small><strong>{applications.find((item) => item.id === selected)?.name ?? "Selected application"}</strong></div></div><fieldset className="key-permission-grid"><legend>Permissions</legend>{permissions.map((permission) => <label className="key-permission-option" key={permission}><input type="checkbox" checked={scopes.includes(permission)} onChange={(event) => setScopes(event.target.checked ? [...scopes, permission] : scopes.filter((item) => item !== permission))} /><span><strong>{permission}</strong><small>{permission === "messages:send" ? "Send SMS messages" : permission === "messages:read" ? "Read message status and history" : permission === "otp:request" ? "Request one-time passwords" : permission === "otp:verify" ? "Verify one-time passwords" : "Read usage and quota information"}</small></span></label>)}</fieldset><p className="key-security-hint"><Icon name="shield" size={15} /> Follow least privilege: enable only what your integration requires.</p><div className="key-create-actions"><button type="button" className="secondary" onClick={() => setKeyDialogOpen(false)}>Cancel</button><button disabled={busy || !scopes.length}><Icon name="key" size={14} /> {busy ? "Creating…" : "Create API key"}</button></div></form></Modal>}
            </>
          )}
          {admin && page === "applications" && (
            <>
              <h2>Application approvals</h2>
              <ul className="user-list">
                {allApps.map((item) => (
                  <li key={item.id}>
                    <span>
                      {item.name} · {item.account}
                    </span>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await api(`/admin/applications/${item.id}`, "PATCH", {
                            enabled: !item.enabled,
                          });
                        })
                      }
                    >
                      {item.enabled ? "Disable" : "Approve & enable"}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {admin && page === "settings" && (
            <section className="workspace-settings" aria-label="Workspace settings">
              <header className="workspace-settings-heading">
                <div>
                  <span className="eyebrow">ADMINISTRATION</span>
                  <h2>Workspace limits</h2>
                  <p>Set the usage budgets, request rates, and destination rules for this workspace.</p>
                </div>
                <span className="workspace-settings-scope"><Icon name="shield" size={14} /> Admin controls</span>
              </header>

              <form
                className="workspace-settings-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void act(async () => {
                    await api("/admin/limits", "PATCH", {
                      ...limits,
                      allowed_destination_prefixes: prefixes
                        .split(",")
                        .map((value) => value.trim()),
                    });
                    setNotice("Workspace limits saved.");
                  });
                }}
              >
                <section className="settings-group" aria-labelledby="settings-budgets-heading">
                  <div className="settings-group-heading">
                    <span className="settings-group-icon"><Icon name="chart" size={17} /></span>
                    <div>
                      <h3 id="settings-budgets-heading">Daily segment budgets</h3>
                      <p>Maximum message segments allowed per day at each level.</p>
                    </div>
                  </div>
                  <div className="settings-fields-grid">
                    {[
                      ["global_daily_segments", "Platform budget", "Applies across the entire EthioSMS platform."],
                      ["tenant_daily_segments", "Workspace budget", "Shared daily allowance for this workspace."],
                      ["application_daily_segments", "Application budget", "Daily allowance for each application."],
                    ].map(([key, label, hint]) => (
                      <label className="settings-field" key={key}>
                        <span>{label}</span>
                        <input
                          type="number"
                          required
                          min={0}
                          max={100000}
                          value={limits[key] ?? ""}
                          onChange={(event) => setLimits({ ...limits, [key]: Number(event.target.value) })}
                        />
                        <small>{hint}</small>
                      </label>
                    ))}
                  </div>
                </section>

                <section className="settings-group" aria-labelledby="settings-rates-heading">
                  <div className="settings-group-heading">
                    <span className="settings-group-icon"><Icon name="activity" size={17} /></span>
                    <div>
                      <h3 id="settings-rates-heading">Request rate limits</h3>
                      <p>Maximum API requests permitted per minute.</p>
                    </div>
                  </div>
                  <div className="settings-fields-grid">
                    {[
                      ["key_requests_per_minute", "Per API key", "Limit for each individual API key."],
                      ["application_requests_per_minute", "Per application", "Combined limit for an application."],
                      ["tenant_requests_per_minute", "Per workspace", "Combined limit for this workspace."],
                      ["global_requests_per_minute", "Platform-wide", "Maximum requests across the platform."],
                    ].map(([key, label, hint]) => (
                      <label className="settings-field" key={key}>
                        <span>{label}</span>
                        <input
                          type="number"
                          required
                          min={1}
                          max={10000}
                          value={limits[key] ?? ""}
                          onChange={(event) => setLimits({ ...limits, [key]: Number(event.target.value) })}
                        />
                        <small>{hint}</small>
                      </label>
                    ))}
                  </div>
                </section>

                <section className="settings-group settings-destinations" aria-labelledby="settings-destinations-heading">
                  <div className="settings-group-heading">
                    <span className="settings-group-icon"><Icon name="globe" size={17} /></span>
                    <div>
                      <h3 id="settings-destinations-heading">Allowed destination prefixes</h3>
                      <p>Restrict which phone-number prefixes applications may send to.</p>
                    </div>
                  </div>
                  <label className="settings-field">
                    <span>Phone-number prefixes</span>
                    <input
                      required
                      value={prefixes}
                      placeholder="+251, +1"
                      onChange={(event) => setPrefixes(event.target.value)}
                    />
                    <small>Separate multiple prefixes with commas. Example: +251, +1</small>
                  </label>
                </section>

                <footer className="workspace-settings-footer">
                  <span><Icon name="info" size={14} /> Changes are saved to the workspace configuration.</span>
                  <button disabled={busy}><Icon name="save" size={14} /> {busy ? "Saving…" : "Save changes"}</button>
                </footer>
              </form>
            </section>
          )}
        </section>
      )}
      {(page === "messages" || visited.has("messages")) && selected && (
        <section hidden={page !== "messages"} className="accounts">
          <Messages
            refreshToken={refreshToken}
            key={selected}
            applicationId={selected}
            onChanged={() => {
              void details(selected).catch((error) => setNotice(error.message));
            }}
          />
        </section>
      )}
      {(page === "campaigns" || visited.has("campaigns")) && selected && (
        <div hidden={page !== "campaigns"}>
          <Campaigns
            refreshToken={refreshToken}
            key={selected}
            applicationId={selected}
          />
        </div>
      )}
      {admin && page === "operations" && (
        <Operations refreshToken={refreshToken} />
      )}
      {admin && page === "campaigns" && (
        <CampaignReview refreshToken={refreshToken} />
      )}
      {!selected && (page === "messages" || page === "campaigns") && (
        <section className="accounts">
          <Empty
            title="Connect your first application"
            action={
              <button onClick={() => setPage("applications")}>
                Create application
              </button>
            }
          >
            Choose an application to start messaging.
          </Empty>
        </section>
      )}
    </Console>
  );
}
