import { BRAND, DISCLAIMER } from '@/config';

/** Minimal masthead. Identity and one trust line — deliberately no navigation. */
export function Masthead() {
  return (
    <header className="masthead">
      <div className="shell masthead__inner">
        <div className="wordmark">
          WIL <span className="wordmark__amp">&amp;</span> LIZ
        </div>
        <p className="masthead__tagline">{BRAND.tagline}</p>
      </div>
    </header>
  );
}

/**
 * Brokerage / licensing block.
 * All strings come from DISCLAIMER in src/config.ts — edit them there.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__grid">
        <div>
          <div className="site-footer__team">{DISCLAIMER.teamName}</div>
          <div className="site-footer__aff">{DISCLAIMER.affiliation}</div>
        </div>

        <div className="site-footer__legal">
          <div className="site-footer__licenses">
            {DISCLAIMER.licensees.map((l) => (
              <span key={l.dre}>
                {l.name} · {l.dre}
              </span>
            ))}
          </div>

          {DISCLAIMER.brokerageLine && <p style={{ margin: 0 }}>{DISCLAIMER.brokerageLine}</p>}

          <p style={{ margin: '0.35rem 0 0' }}>
            © {new Date().getFullYear()} {DISCLAIMER.teamName}. Information you submit is
            used only to contact you about selling your home.
          </p>

          {DISCLAIMER.additional && (
            <p style={{ margin: '0.35rem 0 0' }}>{DISCLAIMER.additional}</p>
          )}
        </div>
      </div>
    </footer>
  );
}
