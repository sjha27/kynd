import { Link } from 'react-router-dom';
import DocPage, { Section, Bullets } from '../components/legal/DocPage';

/*
 * Product transparency, not legal intimidation. A recruiter should be able
 * to read this in under a minute and know exactly what they are looking at.
 */
function DemoInfo() {
  return (
    <DocPage
      title="About this demo"
      intro="Kynd is an independent portfolio project — a working demonstration of what a social product for volunteering and community contribution could be."
    >
      <Section title="What Kynd is">
        <p>
          Kynd explores a simple idea: volunteering and charitable giving are fragmented across
          social media, group chats, and nonprofit websites, and there is no place people
          instinctively open when they want to do something good nearby. Kynd is what that place
          might look like — discovery, participation, and a contribution history that becomes part
          of who you are.
        </p>
        <p>
          It was built to demonstrate product thinking and system design end to end: a relational
          database, a real API, business logic, a social graph, deterministic feed ranking, and
          interconnected state — not a set of disconnected mock screens.
        </p>
      </Section>

      <Section title="Everything here is synthetic">
        <p>
          The community you see is fictional. The people, organizations, opportunities, activities,
          fundraisers, follows, and participation are generated demo data.
        </p>
        <p>
          The demo is set in Atlanta because a marketplace only feels real when it is dense. Real
          place names appear, but <strong className="font-semibold text-ink">no listing here is a
          real event</strong>. Please don&rsquo;t show up anywhere based on something you see in
          Kynd.
        </p>
      </Section>

      <Section title="Your temporary account">
        <p>
          You didn&rsquo;t sign up, and there is no login. When you first open Kynd, the backend
          creates a temporary demo account for you — &ldquo;Frank Enstien&rdquo; — with a few
          starter interests and follows so the product isn&rsquo;t empty.
        </p>
        <p>
          Everything you do belongs to that temporary account and is visible only to you. Other
          visitors have their own separate accounts, and none of you can see each other&rsquo;s
          activity. Sessions expire after 24 hours.
        </p>
        <p>
          <strong className="font-semibold text-ink">Reset demo</strong> — in the sidebar, or at the
          bottom of your profile on mobile — deletes your temporary account and everything you did
          with it, and gives you a fresh one.
        </p>
      </Section>

      <Section title="Fundraising is simulated">
        <p>
          Supporting a fundraiser records the interaction so you can see progress and supporter
          counts change. No payment is processed, no card is collected, no money moves, and no
          charitable donation is made.
        </p>
      </Section>

      <Section title="How it was built">
        <p>
          React and Vite on Cloudflare Pages, a Node and Express API on Render, and PostgreSQL on
          Neon, with a deterministically generated synthetic community of roughly 37,000 rows.
        </p>
        <p>
          AI-assisted development tools were used while building Kynd. The Kynd demo itself does not
          use a generative AI model to produce anything you see or to make product decisions —
          feed ranking, search, and recommendations are deterministic logic written for this
          project. What you enter in the demo is not sent by Kynd to an AI model.
        </p>
      </Section>

      <Section title="How usage is measured">
        <p>
          Kynd records a small set of product events &mdash; that an opportunity was viewed or
          joined, for example &mdash; so its author can see how the demo is used. No third-party
          analytics, no cookies, and nothing you type is ever recorded.{' '}
          <Link to="/privacy" className="font-semibold text-brand underline underline-offset-2">
            Privacy
          </Link>{' '}
          has the detail.
        </p>
      </Section>

      <Section title="Please don't enter anything sensitive">
        <p>
          This is a demonstration, not a private space. Please don&rsquo;t type personal, sensitive,
          or confidential information into comments, stories, or any form here.
        </p>
      </Section>

      <Section title="More detail">
        <p>
          <Link to="/privacy" className="font-semibold text-brand underline underline-offset-2">
            Privacy
          </Link>{' '}
          explains exactly what the demo stores and for how long.{' '}
          <Link to="/terms" className="font-semibold text-brand underline underline-offset-2">
            Terms &amp; demo disclaimer
          </Link>{' '}
          covers what this project is and isn&rsquo;t.
        </p>
      </Section>

      <Section title="At a glance">
        <Bullets
          items={[
            'Independent portfolio project — not a company or a live service.',
            'Every person, organization, opportunity, and fundraiser is synthetic.',
            'No real volunteer placements are arranged and no listing is a real event.',
            'Fundraiser support is simulated — no payments, ever.',
            'Your temporary session expires after 24 hours and is visible only to you.',
            'No account, no password, no cookies set by Kynd.',
            'Usage is measured with simple product events — never the text you write.',
          ]}
        />
      </Section>
    </DocPage>
  );
}

export default DemoInfo;
