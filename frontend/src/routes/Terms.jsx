import { Link } from 'react-router-dom';
import DocPage, { Section, Bullets } from '../components/legal/DocPage';

/*
 * Short, honest, and specific to what this project actually is. No
 * arbitration clause, no class-action waiver, no indemnification, no
 * governing-law section — none of which belong on a portfolio demo without
 * a deliberate decision by the owner.
 */
function Terms() {
  return (
    <DocPage
      title="Terms & demo disclaimer"
      updated="September 5, 2026"
      intro="Kynd is an independent portfolio demonstration, not a live service. This page explains what that means in practice."
    >
      <Section title="What Kynd is">
        <p>
          Kynd is a personal portfolio and demonstration project built to show product and
          engineering work. It is not a company, not a registered organization, and not an operating
          volunteer or fundraising service. It is provided for demonstration purposes only.
        </p>
      </Section>

      <Section title="Everything in the demo is synthetic">
        <p>
          The people, organizations, opportunities, activities, fundraisers, follows, participation,
          reactions, and comments in the seeded community are generated demonstration data. They do
          not describe real people, real organizations, or real events.
        </p>
        <p>
          Real place names — Atlanta neighbourhoods, parks, streets — are used to make the demo feel
          coherent.{' '}
          <strong className="font-semibold text-ink">
            A real location appearing in a listing does not make the listing real.
          </strong>{' '}
          Please do not travel to, or show up at, any location shown in Kynd on the basis of what
          you see here.
        </p>
        <p>
          Synthetic organizations in the demo are invented for this project. They are not affiliated
          with, endorsed by, or connected to any real organization, and any resemblance to a real
          organization&rsquo;s name is unintended.
        </p>
      </Section>

      <Section title="No real volunteering is arranged">
        <p>Kynd does not:</p>
        <Bullets
          items={[
            'arrange real volunteer placements',
            'verify organizations or hosts',
            'confirm that any event exists or will take place',
            'guarantee availability, capacity, or attendance',
            'coordinate anything in the physical world',
          ]}
        />
        <p>
          Joining an opportunity in the demo records a demonstration action. It does not register
          you for anything, and no one is expecting you.
        </p>
      </Section>

      <Section title="No real fundraising or payment">
        <p>
          Supporting a fundraiser is simulated. Selecting an amount records a demonstration
          interaction so you can watch progress and supporter counts update.
        </p>
        <p>No money is transferred. Specifically, there is:</p>
        <Bullets
          items={[
            'no payment processed and no card collected or charged',
            'no charitable donation made to anyone',
            'no tax-deductible contribution',
            'no receipt issued',
          ]}
        />
        <p>
          Goal amounts, amounts raised, and supporter counts are part of the demonstration and do
          not represent real fundraising.
        </p>
      </Section>

      <Section title="Your demo state is temporary">
        <p>
          Your temporary demo account and everything in it are temporary by design. Sessions expire
          after 24 hours, you can delete yours at any time with Reset demo, and demo data may be
          removed as the project is developed. Do not rely on anything here persisting.{' '}
          <Link to="/privacy" className="font-semibold text-brand underline underline-offset-2">
            Privacy
          </Link>{' '}
          explains the lifecycle precisely.
        </p>
      </Section>

      <Section title="What you enter">
        <p>Please don&rsquo;t submit:</p>
        <Bullets
          items={[
            'sensitive personal or confidential information — yours or anyone else’s',
            'content that is unlawful, abusive, harassing, hateful, or deceptive',
            'content you do not have the right to submit',
          ]}
        />
        <p>
          Content submitted to the demo may be removed at any time. It becomes inaccessible when your
          session expires and is deleted when expired sessions are cleaned up, or immediately when
          you use Reset demo.
        </p>
      </Section>

      <Section title="Content you submit">
        <p>
          You keep whatever rights you already have in anything you type into the demo. You give
          Kynd permission to store, process, and display that content as needed to run your
          temporary demo session — nothing more. Kynd does not claim ownership of it and does not
          use it for any other purpose.
        </p>
      </Section>

      <Section title="Reliability">
        <p>
          Kynd is demonstration software, provided as-is. It may contain errors, behave
          unexpectedly, change without notice, become unavailable, or reset. It is not suitable for
          real-world reliance, and should not be used to make decisions about volunteering, giving,
          or anything else.
        </p>
        <p>
          Nothing on this page or elsewhere in Kynd is legal, financial, or tax advice.
        </p>
      </Section>

      <Section title="Attribution and assets">
        <p>
          Photography used in the demo comes from third-party sources under their respective
          licenses and is used to illustrate synthetic listings. People pictured are not
          participants in Kynd, are not associated with this project, and their appearance does not
          imply any endorsement.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          This project is actively developed and this page may change. The date at the top reflects
          the current version.
        </p>
      </Section>

      <Section title="Related">
        <p>
          <Link to="/demo-info" className="font-semibold text-brand underline underline-offset-2">
            About this demo
          </Link>{' '}
          &middot;{' '}
          <Link to="/privacy" className="font-semibold text-brand underline underline-offset-2">
            Privacy
          </Link>
        </p>
      </Section>
    </DocPage>
  );
}

export default Terms;
