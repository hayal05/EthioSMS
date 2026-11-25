import { useState } from "react";
import { Icon } from "./ui";

export function Landing({
  onSignIn,
  onGetStarted,
}: {
  onSignIn: () => void;
  onGetStarted: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return (
    <div className="public-site">
      <header className="public-header">
        <a className="public-brand" href="#home" onClick={closeMenu} aria-label="EthioSMS home">
          <span className="public-brand-mark"><Icon name="message" size={21} /></span>
          <span className="public-brand-copy"><strong>Ethio<span>SMS</span></strong><small>MESSAGING INFRASTRUCTURE</small></span>
        </a>
        <button className="public-menu-toggle" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <Icon name={menuOpen ? "close" : "menu"} />
        </button>
        <nav className={menuOpen ? "public-nav is-open" : "public-nav"} aria-label="Main navigation">
          <a href="#platform" onClick={closeMenu}>Platform</a>
          <a href="#services" onClick={closeMenu}>Services</a>
          <a href="#plans" onClick={closeMenu}>Plans</a>
          <a href="#contact" onClick={closeMenu}>Contact</a>
        </nav>
        <div className="public-header-actions">
          <button className="public-signin" onClick={onSignIn}>Sign in</button>
          <button className="public-primary public-small" onClick={onGetStarted}>Get started <Icon name="arrow" size={15} /></button>
        </div>
      </header>

      <main>
        <section className="public-hero" id="home">
          <div className="public-hero-grid">
            <div className="public-hero-copy">
              <div className="public-overline"><span /> COMMUNICATIONS INFRASTRUCTURE</div>
              <h1>Mission-critical messaging. <em>One clear control plane.</em></h1>
              <p className="public-lead">Connect your applications to SMS with a developer-first API and an operational console built for teams that need visibility, control and dependable workflows.</p>
              <div className="public-hero-actions">
                <button className="public-primary" onClick={onGetStarted}>Create your workspace <Icon name="arrow" size={16} /></button>
                <a className="public-secondary-link" href="#platform">Explore the platform <Icon name="arrow" size={15} /></a>
              </div>
              <div className="public-trust-line">
                <span><Icon name="shield" size={16} /> Scoped API credentials</span>
                <span><Icon name="activity" size={16} /> Delivery status visibility</span>
                <span><Icon name="key" size={16} /> Workspace-level controls</span>
              </div>
            </div>
            <div className="public-console-preview" aria-label="Illustrative messaging console preview">
              <div className="preview-topbar">
                <div className="preview-brand"><span className="preview-dot" /> ETHIOSMS <small>CONTROL PLANE</small></div>
                <span className="preview-status"><i /> WORKSPACE</span>
              </div>
              <div className="preview-body">
                <div className="preview-sidebar">
                  <span className="preview-side-active"><Icon name="grid" size={14} /> Overview</span>
                  <span><Icon name="message" size={14} /> Messages</span>
                  <span><Icon name="box" size={14} /> Applications</span>
                  <span><Icon name="key" size={14} /> API keys</span>
                  <span><Icon name="activity" size={14} /> Usage</span>
                </div>
                <div className="preview-content">
                  <div className="preview-heading"><div><small>WORKSPACE / OVERVIEW</small><strong>Messaging operations</strong></div><span>● MOCK MODE</span></div>
                  <div className="preview-metrics">
                    <div><small>APPLICATIONS</small><strong>—</strong><span>Connected services</span></div>
                    <div><small>API KEYS</small><strong>—</strong><span>Scoped credentials</span></div>
                  </div>
                  <div className="preview-activity">
                    <div className="preview-activity-head"><strong>Message lifecycle</strong><small>STATUS TRACKING</small></div>
                    <div className="preview-step"><i className="done" /><span>Request received</span><b>Accepted</b></div>
                    <div className="preview-step"><i className="done" /><span>Queue processing</span><b>Queued</b></div>
                    <div className="preview-step"><i className="pending" /><span>Gateway handoff</span><b>Awaiting</b></div>
                  </div>
                  <div className="preview-code"><span>API ENDPOINT</span><code>POST&nbsp; /api/v1/messages</code><Icon name="copy" size={14} /></div>
                </div>
              </div>
              <div className="preview-foot"><span>Illustrative interface</span><span>Built for operational clarity</span></div>
            </div>
          </div>
          <div className="public-hero-bottom">
            <span>BUILT FOR</span><strong>ERP platforms</strong><i /><strong>Business applications</strong><i /><strong>Digital services</strong><i /><strong>Developer teams</strong>
          </div>
        </section>

        <section className="public-section public-platform" id="platform">
          <div className="public-section-heading">
            <div><span className="public-kicker">THE PLATFORM</span><h2>Everything your messaging workflow needs.</h2></div>
            <p>One place to connect applications, issue credentials, control usage and follow message activity—from API request to gateway outcome.</p>
          </div>
          <div className="public-capability-grid">
            <article className="public-capability public-capability-featured">
              <span className="public-icon-tile"><Icon name="terminal" /></span>
              <span className="public-card-index">01 / INTEGRATION</span>
              <h3>Developer-first SMS API</h3>
              <p>Connect ERP systems and custom applications through a consistent HTTP API, scoped credentials and idempotent request handling.</p>
              <a href="https://github.com/hayal05/EthioSMS/tree/main/docs" target="_blank" rel="noreferrer">Explore API documentation <Icon name="arrow" size={14} /></a>
            </article>
            <article className="public-capability">
              <span className="public-icon-tile"><Icon name="key" /></span>
              <span className="public-card-index">02 / ACCESS</span>
              <h3>Application & key management</h3>
              <p>Organize integrations into applications. Create, scope, rotate and revoke API keys from the workspace.</p>
            </article>
            <article className="public-capability">
              <span className="public-icon-tile"><Icon name="activity" /></span>
              <span className="public-card-index">03 / OPERATIONS</span>
              <h3>Usage & delivery visibility</h3>
              <p>Review message states, usage budgets and operational activity with clear distinctions between queued, sent and delivered.</p>
            </article>
            <article className="public-capability">
              <span className="public-icon-tile"><Icon name="shield" /></span>
              <span className="public-card-index">04 / VERIFICATION</span>
              <h3>OTP verification workflows</h3>
              <p>Use purpose-bound, expiring, single-use verification challenges with attempt limits and cooldown controls.</p>
            </article>
            <article className="public-capability">
              <span className="public-icon-tile"><Icon name="campaign" /></span>
              <span className="public-card-index">05 / CAMPAIGNS</span>
              <h3>Reviewed messaging campaigns</h3>
              <p>Prepare small recipient campaigns with deduplication, opt-out suppression and administrator review before dispatch.</p>
            </article>
            <article className="public-capability">
              <span className="public-icon-tile"><Icon name="settings" /></span>
              <span className="public-card-index">06 / GOVERNANCE</span>
              <h3>Operational controls</h3>
              <p>Apply quotas, rate limits, access controls and dispatch safeguards to keep messaging activity governed.</p>
            </article>
          </div>
        </section>

        <section className="public-band" id="services">
          <div className="public-band-inner">
            <div className="public-band-copy">
              <span className="public-kicker public-kicker-light">DESIGNED FOR REAL SYSTEMS</span>
              <h2>Messaging that fits the way your business operates.</h2>
              <p>EthioSMS provides the messaging layer. Your applications keep ownership of business logic, customer relationships and the events that trigger notifications.</p>
            </div>
            <div className="public-use-cases">
              <div><span>01</span><div><strong>ERP & business systems</strong><p>Notify teams and customers about approvals, status changes and important events.</p></div><Icon name="arrow" /></div>
              <div><span>02</span><div><strong>Authentication & OTP</strong><p>Integrate verification challenges into sign-in and sensitive application workflows.</p></div><Icon name="arrow" /></div>
              <div><span>03</span><div><strong>Customer communications</strong><p>Manage transactional notifications and reviewed, consent-aware campaigns.</p></div><Icon name="arrow" /></div>
              <div><span>04</span><div><strong>Custom software products</strong><p>Add SMS capabilities without building a messaging control plane from scratch.</p></div><Icon name="arrow" /></div>
            </div>
          </div>
        </section>

        <section className="public-section public-architecture">
          <div className="public-section-heading">
            <div><span className="public-kicker">CONTROL & TRANSPARENCY</span><h2>Built to make every step visible.</h2></div>
            <p>Understand the lifecycle of a message and keep credentials, limits and dispatch decisions under control.</p>
          </div>
          <div className="public-flow">
            <div><span><Icon name="box" /></span><strong>Your application</strong><small>ERP · Web · Mobile</small></div>
            <i />
            <div><span><Icon name="terminal" /></span><strong>EthioSMS API</strong><small>Authentication · Quotas</small></div>
            <i />
            <div><span><Icon name="activity" /></span><strong>Message queue</strong><small>Durable processing</small></div>
            <i />
            <div><span><Icon name="phone" /></span><strong>SMS gateway</strong><small>Configured transport</small></div>
          </div>
          <p className="public-note"><Icon name="alert" size={14} /> Live delivery depends on an enabled and validated gateway, device, SIM and provider configuration. Test mode simulates transport and is not proof of physical SMS delivery.</p>
        </section>

        <section className="public-section public-plans" id="plans">
          <div className="public-section-heading">
            <div><span className="public-kicker">PLANS & ENGAGEMENT</span><h2>A practical path from pilot to scale.</h2></div>
            <p>Choose the level of engagement that matches your integration and operational needs. Commercial pricing and service commitments are discussed directly.</p>
          </div>
          <div className="public-plan-grid">
            <article className="public-plan">
              <span className="public-plan-label">01 / VALIDATION</span><h3>Pilot</h3><p className="public-plan-intro">For teams evaluating an SMS integration with a controlled workload.</p>
              <ul><li><Icon name="check" /> Workspace and application setup</li><li><Icon name="check" /> API credentials and documentation</li><li><Icon name="check" /> Usage and message status visibility</li><li><Icon name="check" /> Controlled test workflow</li></ul>
              <button className="public-plan-button" onClick={onGetStarted}>Start with a workspace <Icon name="arrow" size={14} /></button>
            </article>
            <article className="public-plan public-plan-emphasis">
              <span className="public-plan-label">02 / OPERATIONS</span><h3>Business</h3><p className="public-plan-intro">For production-minded teams integrating messaging into daily operations.</p>
              <ul><li><Icon name="check" /> Integration and rollout discussion</li><li><Icon name="check" /> Quota and usage configuration</li><li><Icon name="check" /> Gateway readiness review</li><li><Icon name="check" /> Operational workflow planning</li></ul>
              <a className="public-plan-button" href="#contact">Discuss business requirements <Icon name="arrow" size={14} /></a>
            </article>
            <article className="public-plan">
              <span className="public-plan-label">03 / CUSTOM</span><h3>Enterprise</h3><p className="public-plan-intro">For organizations with specific infrastructure, governance or deployment requirements.</p>
              <ul><li><Icon name="check" /> Architecture and deployment review</li><li><Icon name="check" /> Custom integration assessment</li><li><Icon name="check" /> Security and operations review</li><li><Icon name="check" /> Tailored commercial proposal</li></ul>
              <a className="public-plan-button" href="#contact">Contact the team <Icon name="arrow" size={14} /></a>
            </article>
          </div>
          <p className="public-pricing-note">Pricing, message allowances, service levels and live delivery availability are confirmed individually. Online billing and automatic credit purchases are not currently offered.</p>
        </section>

        <section className="public-contact" id="contact">
          <div><span className="public-kicker public-kicker-light">LET'S CONNECT</span><h2>Build your next messaging workflow with EthioSMS.</h2><p>Start a workspace, review the integration guides or open a project discussion for deployment and commercial requirements.</p></div>
          <div className="public-contact-actions"><button className="public-contact-primary" onClick={onGetStarted}>Create an account <Icon name="arrow" size={15} /></button><a href="https://github.com/hayal05/EthioSMS/issues/new" target="_blank" rel="noreferrer">Contact via project support <Icon name="arrow" size={15} /></a></div>
        </section>
      </main>

      <footer className="public-footer">
        <div className="public-footer-main">
          <a className="public-brand public-brand-footer" href="#home"><span className="public-brand-mark"><Icon name="message" size={20} /></span><span className="public-brand-copy"><strong>Ethio<span>SMS</span></strong><small>MESSAGING INFRASTRUCTURE</small></span></a>
          <p>Messaging infrastructure for ERP platforms, business applications and developer teams.</p>
          <div className="public-footer-links"><a href="#platform">Platform</a><a href="#services">Services</a><a href="#plans">Plans</a><a href="https://github.com/hayal05/EthioSMS/tree/main/docs" target="_blank" rel="noreferrer">Documentation</a><a href="https://github.com/hayal05/EthioSMS" target="_blank" rel="noreferrer">GitHub</a></div>
        </div>
        <div className="public-footer-bottom"><span>© {new Date().getFullYear()} EthioSMS. All rights reserved.</span><span>Operational transparency · Secure integrations · Controlled delivery</span></div>
      </footer>
    </div>
  );
}
