import { useEffect, useRef, useState, type ReactNode } from "react";
import { Console, Overview, Docs, type Page } from "./Console";
import { Empty, Notice } from "./ui";
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
              <h2>Application credentials</h2>
              <p>
                Issue scoped keys for server-side integrations. Keys are shown
                only once.
              </p>
              <div className="actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await api(`/applications/${selected}`, "PATCH", {
                        enabled: false,
                      });
                    })
                  }
                >
                  Disable application
                </button>
              </div>
              {usage && (
                <p>
                  {usage.application_remaining} application segments remaining ·{" "}
                  {usage.tenant_remaining} account segments remaining ·{" "}
                  {usage.date} (Addis Ababa)
                </p>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void act(async () => {
                    const result = await api(
                      `/applications/${selected}/keys`,
                      "POST",
                      { scopes },
                    );
                    setIssued(result.apiKey);
                  });
                }}
              >
                <fieldset>
                  <legend>Key permissions</legend>
                  {permissions.map((permission) => (
                    <label className="permission" key={permission}>
                      <input
                        type="checkbox"
                        checked={scopes.includes(permission)}
                        onChange={(event) =>
                          setScopes(
                            event.target.checked
                              ? [...scopes, permission]
                              : scopes.filter((item) => item !== permission),
                          )
                        }
                      />
                      {permission}
                    </label>
                  ))}
                </fieldset>
                <button disabled={busy || !scopes.length}>Issue API key</button>
              </form>
              {issued && (
                <div className="token">
                  <strong>
                    Shown once. Save this key privately in your server
                    configuration.
                  </strong>
                  <code>{issued}</code>
                  <button className="secondary" onClick={() => setIssued("")}>
                    Hide key
                  </button>
                </div>
              )}
              <ul className="user-list">
                {keys.map((key) => (
                  <li key={key.id}>
                    <span>
                      <code>{key.prefix}…</code> ·{" "}
                      {key.revoked_at ? "Revoked" : "Active"}
                      <small>{key.scopes.join(", ")}</small>
                    </span>
                    {!key.revoked_at && (
                      <span className="actions">
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              const result = await api(
                                `/applications/${selected}/keys/${key.id}/rotate`,
                                "POST",
                              );
                              setIssued(result.apiKey);
                            })
                          }
                        >
                          Rotate
                        </button>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              await api(
                                `/applications/${selected}/keys/${key.id}`,
                                "DELETE",
                              );
                            })
                          }
                        >
                          Revoke
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
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
            <>
              <h2>Workspace limits</h2>
              <p>
                Control daily segment budgets, request rates, and destination
                prefixes.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void act(async () => {
                    await api("/admin/limits", "PATCH", {
                      ...limits,
                      allowed_destination_prefixes: prefixes
                        .split(",")
                        .map((value) => value.trim()),
                    });
                    setNotice("Limits saved.");
                  });
                }}
              >
                {Object.entries(limitLabels).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      required
                      min={key.includes("daily") ? 0 : 1}
                      max={key.includes("daily") ? 100000 : 10000}
                      value={limits[key] ?? ""}
                      onChange={(event) =>
                        setLimits({
                          ...limits,
                          [key]: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                ))}
                <label>
                  Allowed prefixes (comma separated)
                  <input
                    required
                    value={prefixes}
                    onChange={(event) => setPrefixes(event.target.value)}
                  />
                </label>
                <button disabled={busy}>Save limits</button>
              </form>
            </>
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
