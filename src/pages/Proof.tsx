import { Link } from "react-router";

/* /proof: what the "Recorded on Tilo" badge means, and what it doesn't. */
export function Proof() {
  return (
    <main id="main" tabIndex={-1} className="wrap prose-page">
      <p className="kicker">Proof of hand</p>
      <h1>How proof works</h1>
      <p className="serif lede">
        Every piece on Tilo is a recording: each stroke, in the order it was made, with the time it ended. Press play on any piece and you
        watch it drawn again.
      </p>

      <h2>What the server checks</h2>
      <p className="serif">When a piece is published, Tilo's server reads the recording before it keeps anything. It turns a recording away when it couldn't have been drawn:</p>
      <ul className="serif">
        <li>its times are from before Tilo existed, or from the future;</li>
        <li>its strokes go back in time;</li>
        <li>its strokes move faster than a hand can.</li>
      </ul>
      <p className="serif">
        A piece gets the <b>Recorded on Tilo</b> badge when its recording reads like a person drawing: every stroke has its time, there are at
        least three strokes over at least five seconds, none of them is faster than a hand, and a pen's pressure changes the way it does
        under a real hand. In a remix, this is about the strokes the remixer added.
      </p>

      <h2>What the badge doesn't prove</h2>
      <p className="serif">
        The badge is a deterrent, not proof. Someone careful could write a program that makes a fake recording and passes every check above.
        The badge makes faking work rather than impossible. A later version will look at how each stroke moves, which is much harder to fake.
      </p>
      <p className="serif">The pieces by @tilo were made for the prototype before strokes carried their times, so they don't have the badge.</p>

      <h2>Tilo is for all ages</h2>
      <p className="serif">
        The server also draws every piece from its recording, at many points along its replay and with each layer on its own, and runs those
        pictures through an automatic check for nudity and sexual content. Whatever it flags waits for a moderator. A new member's first three
        pieces are always looked at by a moderator before they go into the gallery.
      </p>
      <p className="serif">
        Anyone signed in can report a piece or a profile. A report that a piece isn't for all ages takes it out of the gallery at once, until a
        moderator looks. Moderators can hide or remove pieces and suspend accounts.
      </p>
      <p className="serif"><Link to="/gallery">Back to the gallery</Link></p>
    </main>
  );
}
