import { useEffect, useState } from 'react';
import { Campaigns, CampaignReview } from './Campaigns';
import { Messages, Operations } from './Messages';
import { api } from './api';

interface Application { id: string; name: string; enabled: boolean; account?: string }
interface Key { id: string; prefix: string; scopes: string[]; revoked_at: string | null }
type View = 'overview' | 'applications' | 'messages' | 'campaigns' | 'reviews' | 'users' | 'settings';

const permissions = ['messages:send', 'messages:read', 'otp:request', 'otp:verify', 'usage:read'];
const limitLabels: Record<string, string> = {
  global_daily_segments: 'Platform segments / day',
  tenant_daily_segments: 'Account segments / day',
  application_daily_segments: 'Application segments / day',
  key_requests_per_minute: 'Requests / key / minute',
  application_requests_per_minute: 'Requests / application / minute',
  tenant_requests_per_minute: 'Requests / account / minute',
  global_requests_per_minute: 'Platform requests / minute'
};

const developerNavigation: { id: View; label: string; icon: string }[] = [
  { id: 'applications', label: 'Applications', icon: 'app' },
  { id: 'messages', label: 'Messages', icon: 'message' },
  { id: 'campaigns', label: 'Campaigns', icon: 'campaign' }
];
const adminNavigation: { id: View; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'applications', label: 'Applications', icon: 'app' },
  { id: 'messages', label: 'Messages', icon: 'message' },
  { id: 'campaigns', label: 'Campaigns', icon: 'campaign' },
  { id: 'reviews', label: 'Campaign review', icon: 'review' },
  { id: 'users', label: 'Users', icon: 'app' },
  { id: 'settings', label: 'Limits & settings', icon: 'settings' }
];

function NavigationIcon({ type }: { type: string }) {
  const paths: Record<string, string> = {
    overview: 'M3 3h7v7H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 14h7v7H3z',
    app: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
    message: 'M4 5h16v11H9l-5 4z',
    campaign: 'M4 12h4l3-7 4 14 3-7h2',
    review: 'm5 12 4 4L19 6',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.1h-2.6v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6v-2.6h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L9 6.6l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.1h2.6v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1V14h-.1a1.7 1.7 0 0 0-1.1 1z'
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[type] || paths.app} /></svg>;
}


function AdminUsers() {
  const [users, setUsers] = useState<{id:string;username:string;role:'admin'|'user';enabled?:boolean}[]>([]);
  const [invite, setInvite] = useState('');
  const [issued, setIssued] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() { setUsers((await api('/admin/users')).users); }
  useEffect(() => { void load().catch(error => setNotice(error.message)); }, []);
  async function action(work: () => Promise<void>) {
    setBusy(true); setNotice(''); setIssued('');
    try { await work(); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  return <section className="accounts" aria-label="User management">
    <div className="subsection-heading"><h3>Invite a user</h3><p>Create a private, time-limited setup invitation</p></div>
    <form onSubmit={event => { event.preventDefault(); void action(async () => { const result = await api('/admin/users', 'POST', {username:invite}); setIssued(result.setupToken); setInvite(''); }); }}>
      <label>Username<input required pattern="[a-z0-9][a-z0-9_.-]{2,79}" value={invite} onChange={event => setInvite(event.target.value)} /></label>
      <button disabled={busy}>Create invitation</button>
    </form>
    {issued && <div className="token"><strong>Share privately. This setup token expires in 24 hours.</strong><code>{issued}</code><button className="secondary" onClick={() => setIssued('')}>Hide token</button></div>}
    <div className="subsection-heading"><h3>Accounts</h3><p>Manage invited developer access</p></div>
    <ul className="user-list">{users.map(item => <li key={item.id}><span>{item.username} · {item.enabled ? 'Enabled' : 'Disabled'}</span>{item.role === 'user' && <span className="actions"><button className="secondary" disabled={busy} onClick={() => void action(async () => { await api(`/admin/users/${item.id}`, 'PATCH', {enabled:!item.enabled}); })}>{item.enabled ? 'Disable' : 'Enable'}</button><button className="secondary" disabled={busy || !item.enabled} onClick={() => void action(async () => { const result = await api(`/admin/users/${item.id}/recovery`, 'POST'); setIssued(result.setupToken); })}>Reset access</button></span>}</li>)}</ul>
    <p role="status">{notice}</p>
  </section>;
}

export function Developer({ admin }: { admin: boolean }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [allApps, setAllApps] = useState<Application[]>([]);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const [keys, setKeys] = useState<Key[]>([]);
  const [scopes, setScopes] = useState(['messages:send', 'messages:read', 'usage:read']);
  const [issued, setIssued] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<{ application_remaining: number; tenant_remaining: number; date: string } | null>(null);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [prefixes, setPrefixes] = useState('+251');
  const [activeView, setActiveView] = useState<View>(admin ? 'overview' : 'applications');

  const navigation = admin ? adminNavigation : developerNavigation;

  async function refresh() {
    const result = await api('/applications');
    setApplications(result.applications);
    if (admin) {
      setAllApps((await api('/admin/applications')).applications);
      const config = await api('/admin/limits');
      setLimits(Object.fromEntries(Object.keys(limitLabels).map(key => [key, config[key]])));
      setPrefixes(config.allowed_destination_prefixes.join(', '));
    }
  }

  async function details(id: string) {
    if (!id) return;
    const result = await api(`/applications/${id}/keys`);
    setKeys(result.keys);
    setUsage(await api(`/applications/${id}/usage`));
  }

  useEffect(() => { void refresh().catch(error => setNotice(error.message)); }, [admin]);
  useEffect(() => {
    setIssued('');
    setKeys([]);
    setUsage(null);
    void details(selected).catch(error => setNotice(error.message));
  }, [selected]);

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setNotice('');
    setIssued('');
    try {
      await work();
      await refresh();
      await details(selected);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return <section className="workspace" aria-label={admin ? 'Master Admin workspace' : 'Developer workspace'}>
    <div className="workspace-heading">
      <div>
        <p className="workspace-kicker">{admin ? 'MASTER ADMIN' : 'DEVELOPER'}</p>
        <h1 className="workspace-title">{admin ? 'Control center' : 'Developer workspace'}</h1>
      </div>
      {selected && <span className="workspace-app">{applications.find(item => item.id === selected)?.name || 'Application selected'}</span>}
    </div>

    <div className="workspace-layout">
      <aside className="workspace-sidebar" aria-label="Workspace navigation">
        <p className="nav-heading">WORKSPACE</p>
        <nav className="workspace-nav">
          {navigation.map(item => <button key={item.id} type="button" className={activeView === item.id ? 'nav-item active' : 'nav-item'} aria-current={activeView === item.id ? 'page' : undefined} onClick={() => setActiveView(item.id)}>
            <NavigationIcon type={item.icon} />
            <span>{item.label}</span>
          </button>)}
        </nav>
        <div className="sidebar-note">
          <span className="sidebar-note-dot" />
          <span>Private pilot</span>
        </div>
      </aside>

      <div className="workspace-content">
        {activeView === 'overview' && admin && <div className="workspace-section">
          <div className="section-heading"><div><h2>Overview</h2><p>Dispatch and platform activity</p></div></div>
          <Operations />
        </div>}

        {activeView === 'applications' && <div className="workspace-section">
          <div className="section-heading"><div><h2>Applications</h2><p>Manage connected apps and API access</p></div></div>
          <section className="accounts" aria-label="Developer applications">
            <h2>Create application</h2>
            <form onSubmit={event => { event.preventDefault(); void act(async () => { await api('/applications', 'POST', { name }); setName(''); setNotice('Application created. Administrator approval is required before API access.'); }); }}>
              <label>Application name<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>
              <button disabled={busy}>Create application</button>
            </form>
            <label className="app-select">Select application
              <select value={selected} onChange={event => setSelected(event.target.value)} disabled={busy}>
                <option value="">Choose an application</option>
                {applications.map(item => <option key={item.id} value={item.id}>{item.name} · {item.enabled ? 'Enabled' : 'Awaiting approval'}</option>)}
              </select>
            </label>
            {selected && <>
              <div className="selected-app-bar"><div><strong>{applications.find(item => item.id === selected)?.name}</strong><span>{applications.find(item => item.id === selected)?.enabled ? 'Enabled' : 'Awaiting approval'}</span></div><button className="secondary" disabled={busy} onClick={() => void act(async () => { await api(`/applications/${selected}`, 'PATCH', { enabled: false }); })}>Disable application</button></div>
              {usage && <div className="usage-summary"><div><strong>{usage.application_remaining}</strong><span>Application segments remaining</span></div><div><strong>{usage.tenant_remaining}</strong><span>Account segments remaining</span></div><small>{usage.date} · Addis Ababa</small></div>}
              <div className="subsection-heading"><h3>API keys</h3><p>Keys are shown once when created.</p></div>
              <form onSubmit={event => { event.preventDefault(); void act(async () => { const result = await api(`/applications/${selected}/keys`, 'POST', { scopes }); setIssued(result.apiKey); }); }}>
                <fieldset><legend>Key permissions</legend>{permissions.map(permission => <label className="permission" key={permission}><input type="checkbox" checked={scopes.includes(permission)} onChange={event => setScopes(event.target.checked ? [...scopes, permission] : scopes.filter(item => item !== permission))} />{permission}</label>)}</fieldset>
                <button disabled={busy || !scopes.length}>Issue API key</button>
              </form>
              {issued && <div className="token"><strong>Save this key privately. It will not be shown again.</strong><code>{issued}</code><button className="secondary" onClick={() => setIssued('')}>Hide key</button></div>}
              <ul className="user-list">{keys.map(key => <li key={key.id}><span><code>{key.prefix}…</code> · {key.revoked_at ? 'Revoked' : 'Active'}<small>{key.scopes.join(', ')}</small></span>{!key.revoked_at && <span className="actions"><button className="secondary" disabled={busy} onClick={() => void act(async () => { const result = await api(`/applications/${selected}/keys/${key.id}/rotate`, 'POST'); setIssued(result.apiKey); })}>Rotate</button><button className="secondary" disabled={busy} onClick={() => void act(async () => { await api(`/applications/${selected}/keys/${key.id}`, 'DELETE'); })}>Revoke</button></span>}</li>)}</ul>
            </>}
            {admin && <><div className="subsection-heading"><h3>Application approvals</h3><p>Review access requests</p></div><ul className="user-list">{allApps.map(item => <li key={item.id}><span>{item.name} · {item.account}</span><button className="secondary" disabled={busy} onClick={() => void act(async () => { await api(`/admin/applications/${item.id}`, 'PATCH', { enabled: !item.enabled }); })}>{item.enabled ? 'Disable' : 'Approve & enable'}</button></li>)}</ul></>}
          </section>
        </div>}

        {activeView === 'messages' && <div className="workspace-section">
          <div className="section-heading"><div><h2>Messages</h2><p>Send and review SMS activity</p></div></div>
          {selected ? <section className="accounts"><Messages key={selected} applicationId={selected} onChanged={() => { void details(selected).catch(error => setNotice(error.message)); }} /></section> : <div className="workspace-empty"><strong>Select an application first</strong><p>Choose an application in the Applications section to send messages and view its history.</p><button onClick={() => setActiveView('applications')}>Go to applications</button></div>}
        </div>}

        {activeView === 'campaigns' && <div className="workspace-section">
          <div className="section-heading"><div><h2>Campaigns</h2><p>Prepare and manage small recipient campaigns</p></div></div>
          {selected ? <Campaigns key={selected} applicationId={selected} /> : <div className="workspace-empty"><strong>Select an application first</strong><p>Choose an application in the Applications section to manage its campaigns.</p><button onClick={() => setActiveView('applications')}>Go to applications</button></div>}
        </div>}

        {activeView === 'reviews' && admin && <div className="workspace-section">
          <div className="section-heading"><div><h2>Campaign review</h2><p>Approve or reject pending campaigns</p></div></div>
          <CampaignReview />
        </div>}

        {activeView === 'users' && admin && <div className="workspace-section">\n          <div className="section-heading"><div><h2>Users</h2><p>Invite and manage developer accounts</p></div></div>\n          <AdminUsers />\n        </div>}\n\n        {activeView === 'settings' && admin && <div className="workspace-section">
          <div className="section-heading"><div><h2>Limits & settings</h2><p>Manage pilot quotas and allowed destinations</p></div></div>
          <section className="accounts">
            <form onSubmit={event => { event.preventDefault(); void act(async () => { await api('/admin/limits', 'PATCH', { ...limits, allowed_destination_prefixes: prefixes.split(',').map(value => value.trim()) }); setNotice('Limits saved.'); }); }}>
              {Object.entries(limitLabels).map(([key, label]) => <label key={key}>{label}<input type="number" required min={key.includes('daily') ? 0 : 1} max={key.includes('daily') ? 100000 : 10000} value={limits[key] ?? ''} onChange={event => setLimits({ ...limits, [key]: Number(event.target.value) })} /></label>)}
              <label>Allowed phone prefixes<input required value={prefixes} onChange={event => setPrefixes(event.target.value)} /></label>
              <button disabled={busy}>Save settings</button>
            </form>
          </section>
        </div>}
        {notice && <p className="workspace-notice" role="status">{notice}</p>}
      </div>
    </div>
  </section>;
}
