import { useEffect, useState } from "react";
import { api } from "./api";
import { Empty, Icon, Modal } from "./ui";
export function Campaigns({
  applicationId,
  refreshToken = 0,
}: {
  applicationId: string;
  refreshToken?: number;
}) {
  const [contacts, setContacts] = useState(""),
    [message, setMessage] = useState(""),
    [optout, setOptout] = useState(""),
    [note, setNote] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [rows, setRows] = useState<any[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [id, setId] = useState(() => crypto.randomUUID()),
    [suppression, setSuppression] = useState("");
  const [composing, setComposing] = useState(false);
  const base = `/applications/${applicationId}`;
  const body = {
    contacts,
    message,
    optOutInstructions: optout,
    consentNote: note,
    consentConfirmed: confirmed,
  };
  const load = async () => setRows((await api(`${base}/campaigns`)).campaigns);
  useEffect(() => {
    void load().catch((error) => setNotice(error.message));
  }, [applicationId, refreshToken]);
  const change = () => {
    setPreview(null);
    setId(crypto.randomUUID());
  };
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await work();
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Campaign unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="accounts">
      <div className="compose-toolbar">
        <div>
          <h2>Campaign history</h2>
          <p>Bulk messages with consent and administrator review.</p>
        </div>
        <button
          onClick={() => {
            setNotice("");
            setComposing(true);
          }}
        >
          <Icon name="plus" /> New campaign
        </button>
      </div>
      {composing && (
        <Modal
          title="Create a campaign"
          description="Import recipients, add your message, and preview before submitting for approval."
          onClose={() => setComposing(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void action(async () =>
                setPreview(
                  await api(`${base}/campaigns/preview`, "POST", body),
                ),
              );
            }}
          >
            <label className="wide">
              Phone numbers (one column; paste or CSV)
              <textarea
                required
                value={contacts}
                onChange={(event) => {
                  setContacts(event.target.value);
                  change();
                }}
              />
            </label>
            <label>
              Import CSV / text
              <input
                type="file"
                accept=".csv,.txt"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 8192) {
                    setNotice("Use a file smaller than 8 KB.");
                    return;
                  }
                  void file
                    .text()
                    .then((text) => {
                      setContacts(text);
                      change();
                    })
                    .catch(() =>
                      setNotice(
                        "Could not read this file. Try pasting your recipients.",
                      ),
                    );
                }}
              />
            </label>
            <label className="wide">
              Message
              <textarea
                required
                maxLength={1300}
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  change();
                }}
              />
            </label>
            <label className="wide">
              Opt-out instructions (included in SMS)
              <input
                required
                minLength={5}
                maxLength={300}
                placeholder="Contact us at … to stop campaign messages"
                value={optout}
                onChange={(event) => {
                  setOptout(event.target.value);
                  change();
                }}
              />
            </label>
            <label className="wide">
              How recipients gave consent
              <input
                required
                minLength={5}
                maxLength={500}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  change();
                }}
              />
            </label>
            <label className="permission">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => {
                  setConfirmed(event.target.checked);
                  change();
                }}
              />
              I confirm these recipients consented to this campaign.
            </label>
            <button disabled={busy}>Preview campaign</button>
          </form>
          {preview && (
            <div className="token">
              <p>
                {preview.eligible.length} eligible · {preview.duplicates}{" "}
                duplicate entries · {preview.suppressed} opted out ·{" "}
                {preview.totalSegments} segments
              </p>
              <p>{preview.eligible.join(", ")}</p>
              <button
                disabled={busy || !confirmed || !preview.eligible.length}
                onClick={() =>
                  void action(async () => {
                    const result = await api(
                      `${base}/campaigns`,
                      "POST",
                      body,
                      { "Idempotency-Key": id },
                    );
                    setNotice(
                      `Campaign ${result.id} submitted for administrator approval.`,
                    );
                    setPreview(null);
                    setComposing(false);
                  })
                }
              >
                Submit for approval
              </button>
            </div>
          )}
          <p role="status">{notice}</p>
        </Modal>
      )}
      {!rows.length && (
        <Empty icon="campaign" title="No campaigns yet">
          Create a campaign to preview recipients and request approval.
        </Empty>
      )}
      <ul className="user-list">
        {rows.map((row) => (
          <li key={row.id}>
            <span>
              {new Date(row.created_at).toLocaleString("en-GB", {
                timeZone: "Africa/Addis_Ababa",
              })}{" "}
              · {row.recipients} recipient(s) ·{" "}
              {row.approved_at ? "Approved" : "Not approved"}
            </span>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const result = await api(
                    `${base}/campaigns/${row.id}/cancel`,
                    "POST",
                  );
                  setNotice(`${result.cancelled} unsent recipients cancelled.`);
                })
              }
            >
              Cancel unsent
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action(async () => {
            await api(`${base}/suppressions`, "POST", { to: suppression });
            setSuppression("");
            setNotice("Number suppressed for future campaigns.");
          });
        }}
      >
        <label>
          Record an opt-out
          <input
            required
            value={suppression}
            onChange={(event) => setSuppression(event.target.value)}
          />
        </label>
        <button disabled={busy}>Suppress number</button>
      </form>
      <p role="status">{notice}</p>
    </section>
  );
}
export function CampaignReview({
  refreshToken = 0,
}: {
  refreshToken?: number;
}) {
  const [rows, setRows] = useState<any[]>([]),
    [detail, setDetail] = useState<any>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => setRows((await api("/admin/campaigns")).campaigns);
  useEffect(() => {
    void load().catch((error) => setNotice(error.message));
  }, [refreshToken]);
  async function action(path: string, method = "GET", data?: unknown) {
    setBusy(true);
    try {
      const result = await api(path, method, data);
      if (method === "GET") setDetail(result);
      else {
        setDetail(null);
        await load();
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="accounts">
      <h2>Pending approval</h2>
      <p>Review campaign content and consent before enabling dispatch.</p>
      {!rows.some((row) => row.pending && !row.approved_at) && (
        <p className="form-hint">No campaigns awaiting review.</p>
      )}
      <ul className="user-list">
        {rows
          .filter((row) => row.pending && !row.approved_at)
          .map((row) => (
            <li key={row.id}>
              <span>
                {row.application} · {row.pending} recipients
                <small>Consent: {row.consent_note}</small>
                <small>Opt-out: {row.opt_out_instructions}</small>
              </span>
              <button
                disabled={busy}
                onClick={() => void action(`/admin/campaigns/${row.id}`)}
              >
                Review
              </button>
            </li>
          ))}
      </ul>
      {detail && (
        <div className="token">
          <p style={{ whiteSpace: "pre-wrap" }}>{detail.message}</p>
          <p>{detail.recipients.map((item: any) => item.to).join(", ")}</p>
          <div className="actions">
            <button
              disabled={busy}
              onClick={() =>
                void action(`/admin/campaigns/${detail.id}/approve`, "POST", {
                  reviewConfirmed: true,
                })
              }
            >
              Approve campaign
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void action(`/admin/campaigns/${detail.id}/reject`, "POST")
              }
            >
              Reject / cancel unsent
            </button>
          </div>
        </div>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
