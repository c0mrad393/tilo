import { Link } from "react-router";
import { CONTACT, COSTS, SUPPORT } from "../data/legal";

/* /support: how to help pay for Tilo. Giving buys nothing on Tilo: no perks, no badge, no
   place in the gallery, so nothing anyone can make depends on it. */
export function Support() {
  return (
    <main id="main" tabIndex={-1} className="wrap prose-page support-page">
      <p className="kicker">Support Tilo</p>
      <h1>Keep the press running</h1>
      <p className="serif lede">
        Tilo is free and stays free: drawing, publishing, the gallery and stamps. It has no ads and sells nothing about anyone. It is made and
        paid for by one person, and gifts from the people who use it help keep it that way.
      </p>

      {SUPPORT.url ? (
        <p className="support-cta">
          <a className="btn btn-ink" href={SUPPORT.url} target="_blank" rel="noopener noreferrer">
            Give through {SUPPORT.via}
          </a>
          <span className="field-note">Opens {SUPPORT.via} in a new tab. Any amount, once or every month.</span>
        </p>
      ) : (
        <p className="support-soon serif" role="status">
          Gifts open soon. Until then, the best support is to draw, publish, and tell someone who draws.
        </p>
      )}

      <h2>What it pays for</h2>
      <table className="support-costs">
        <tbody>
          {COSTS.map(([what, cost]) => (
            <tr key={what}>
              <th scope="row" className="serif">{what}</th>
              <td>{cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="serif">
        Anything beyond the bills goes into time for Tilo: the next tools on the roadmap are pixel art and animation.
      </p>

      <h2>What it doesn't buy</h2>
      <p className="serif">
        Giving doesn't unlock anything, put a badge on your profile, or move your work up the gallery. Everyone gets the same Tilo, whether they
        give or not.
      </p>

      <h2>Other ways to help</h2>
      <ul className="serif">
        <li>Draw, and publish what you're proud of. A gallery is only as good as what's in it.</li>
        <li>Stamp the pieces you like; it tells artists someone looked.</li>
        <li>Report what doesn't belong, so Tilo stays for all ages.</li>
        <li>Tell us what's broken or missing at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</li>
      </ul>
      <p className="serif">
        <Link to="/studio">Open the studio</Link>
      </p>
    </main>
  );
}
