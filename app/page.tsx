import Link from "next/link";

export default function Home() {
  return (
    <main className="nayan-page">
      <header className="nayan-header">
        <Link className="wordmark" href="/" aria-label="NAYAN home">
          NAYAN
        </Link>

        <div className="header-meta">
          <span>INDIA</span>
          <span className="meta-dot" aria-hidden="true" />
          <span>FROM ABOVE</span>
        </div>
      </header>

      <section className="hero" id="top" aria-labelledby="hero-title">
        <div className="hero-kicker">AN OPEN VIEW OF INDIA</div>

        <h1 id="hero-title">
          SEE INDIA
          <br />
          <span>FROM ABOVE.</span>
        </h1>

        <p className="hero-copy">
          Explore India from a different perspective. A living view of the
          country, built one layer at a time.
        </p>

        <Link className="enter-button" href="/explore">
          <span>ENTER NAYAN</span>
          <span className="arrow" aria-hidden="true">↗</span>
        </Link>
      </section>

      <footer className="nayan-footer">
        <div className="footer-note">
          <span className="status-dot" aria-hidden="true" />
          <span>THE VIEW IS BEING BUILT</span>
        </div>

        <div className="credit">
          MADE BY <span>RAIHAN</span>
          <span className="credit-divider" aria-hidden="true">/</span>
          <a href="https://raihanshiras.vercel.app/" target="_blank" rel="noreferrer">
            PORTFOLIO ↗
          </a>
        </div>

        <div className="footer-index">01 / 01</div>
      </footer>
    </main>
  );
}
