import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { Accounts } from './Accounts';

function App() {
  const [health, setHealth] = useState<'checking' | 'reachable' | 'unavailable'>('checking');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    fetch('/health', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Health check failed');
        const data = await response.json();
        setHealth(data.status === 'ok' && data.service === 'EthioSMS' ? 'reachable' : 'unavailable');
      }).catch(() => setHealth('unavailable')).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, []);
  return <main>
    <header><a href="/" className="brand"><span className="mark">E</span>EthioSMS</a><span className="badge">Private pilot</span></header>
    <section className="intro"><p className="eyebrow">YOUR APPS. YOUR CONNECTION.</p><h1>A simple home for<br/>your messages.</h1><p className="lead">SMS notifications and verification for your ERP and local applications.</p></section>
    <section className="status" aria-label="Pilot status"><div><span className="dot"/><strong>Pilot workspace</strong><p>Sign in to manage applications, messages, and verification.</p></div><span className="badge muted">Invite only</span></section>
    <section className="grid" aria-label="Planned services">{[
      ['01', 'Notifications', 'Keep people informed about leave requests, orders, and account activity.'],
      ['02', 'Verification', 'Connect your applications to a single-use OTP verification service.'],
      ['03', 'Small campaigns', 'Reach approved contact lists with controlled bulk messages.']
    ].map(([number, title, description]) => <article key={number}><span className="number">{number}</span><h2>{title}</h2><p>{description}</p><span className="planned">Pilot service</span></article>)}</section>
    <Accounts/>
    <footer><span role="status">API: {health === 'checking' ? 'checking…' : health}</span><span>Gateway status available after sign-in</span></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
