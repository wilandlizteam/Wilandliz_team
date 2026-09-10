import { DISCLAIMER, EHOMES_LOGO } from '@/config';
import logo from '@/assets/logo-legacy-built.png';

/**
 * The company name is always lowercase. Wrapping it keeps it that way even
 * inside styles that uppercase their text.
 */
function Ehomes() {
  return <span className="ehomes">ehomes</span>;
}

/** Minimal masthead: the mark, the name, one trust line. No navigation. */
export function Masthead() {
  return (
    <header className="masthead">
      <div className="shell masthead__inner">
        <div className="masthead__brand">
          <img
            className="masthead__logo"
            src={logo}
            width={420}
            height={368}
            alt=""
            decoding="async"
          />
          <span className="wordmark">
            WIL <span className="wordmark__amp">&amp;</span> LIZ
          </span>
        </div>

        <p className="masthead__tagline">
          <span className="masthead__tagline-caps">Zillow &amp; Opendoor Premier Partners</span>
          <span className="masthead__sep" aria-hidden="true">
            |
          </span>
          <Ehomes />
        </p>
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
          <div className="site-footer__aff">Zillow &amp; Opendoor Premier Partners</div>

          {/* Powered-by credit. The ehomes logo appears here once the official
              asset is supplied (EHOMES_LOGO in src/config.ts); until then the
              name carries it on its own — no placeholder mark. */}
          <div className="powered-by">
            <span className="powered-by__label">Powered by</span>
            {EHOMES_LOGO ? (
              <img
                className="powered-by__logo"
                src={EHOMES_LOGO}
                width={296}
                height={156}
                alt="ehomes"
                decoding="async"
              />
            ) : (
              <span className="powered-by__name">
                <Ehomes />
              </span>
            )}
          </div>
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
            used only to contact you about your real estate goals.
          </p>

          {DISCLAIMER.additional && (
            <p style={{ margin: '0.35rem 0 0' }}>{DISCLAIMER.additional}</p>
          )}
        </div>
      </div>
    </footer>
  );
}
