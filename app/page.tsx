export default function Home() {
  return (
    <main className="nayan-page">
      <header className="nayan-header">
        <a className="wordmark" href="#top" aria-label="NAYAN home">
          NAYAN
        </a>

        <div className="header-meta">
          <span>INDIA</span>
          <span className="meta-dot" aria-hidden="true" />
          <span>FROM ABOVE</span>
        </div>
      </header>

      <section className="hero" id="top" aria-labelledby="hero-title">
        <div className="hero-kicker">
          <span className="eyebrow-line" aria-hidden="true" />
          <span>AN OPEN VIEW OF INDIA</span>
        </div>

        <h1 id="hero-title">
          SEE INDIA
          <br />
          <em>FROM ABOVE.</em>
        </h1>

        <p className="hero-copy">
          Explore the country as a living map — from the scale of the
          subcontinent down to the places that define it.
        </p>

        <button className="enter-button" type="button">
          <span>ENTER NAYAN</span>
          <span className="arrow" aria-hidden="true">↗</span>
        </button>
      </section>

      <footer className="nayan-footer">
        <div className="footer-note">
          <span className="status-dot" aria-hidden="true" />
          <span>THE VIEW IS BEING BUILT</span>
        </div>

        <div className="coordinates" aria-label="India coordinates">
          20.5937° N&nbsp;&nbsp; 78.9629° E
        </div>

        <div className="footer-index">01 / 01</div>
      </footer>
    </main>
  );
}
