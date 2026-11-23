import { Link } from 'react-router-dom';

export function PrivacyPolicyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-3 border-b border-hairline pb-6">
        <Link
          to="/"
          className="inline-flex items-center text-xs font-medium text-pine underline-offset-2 hover:underline"
        >
          &larr; Back to home
        </Link>
        <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="text-xs text-ink-muted">
          Effective Date: November 2026 &middot; Project: Àjọfún (Open-Source Community Project) &middot;
          License: MIT
        </p>
      </div>

      <section className="space-y-3 text-sm leading-relaxed text-ink-muted">
        <h2 className="font-display text-xl font-semibold text-ink">1. Overview</h2>
        <p>
          Àjọfún is an open-source gift exchange coordination tool created to help friends,
          families, and teams organize private gift exchanges without spoiling who drew whom. This
          Privacy Policy explains what information is collected, how it is handled, who can see it
          within an exchange, and how your privacy is protected by design.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed text-ink-muted">
        <h2 className="font-display text-xl font-semibold text-ink">
          2. Information We Collect
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-medium text-ink">Account &amp; authentication data:</strong>{' '}
            Your name, email address, and user ID when signing up with email and password or
            continuing with third-party authentication (such as Google OAuth). Passwords are hashed
            and processed securely by our managed authentication provider (Neon Auth); plain-text
            passwords are never stored or seen by the application.
          </li>
          <li>
            <strong className="font-medium text-ink">Gift exchange settings:</strong> Exchange
            title, optional description, suggested budget, currency, exchange date, invite code,
            lifecycle status, timestamps, and organizer-configured exclusion rules.
          </li>
          <li>
            <strong className="font-medium text-ink">Participant &amp; wishlist data:</strong> Your
            display name for each exchange, gift ideas (titles, optional links, and notes), dislikes
            or dietary preferences, and optional delivery or handoff notes.
          </li>
          <li>
            <strong className="font-medium text-ink">Match assignments &amp; Anonymous Q&amp;A:</strong>{' '}
            Pairing assignments generated during a draw, match reveal timestamps, and anonymous Q&amp;A
            messages exchanged between Anonymous Gifters and their recipients.
          </li>
          <li>
            <strong className="font-medium text-ink">Session &amp; technical data:</strong> Strictly
            necessary session tokens and standard server request logs required to serve and secure
            the application.
          </li>
        </ul>
      </section>

      <section className="space-y-3 text-sm leading-relaxed text-ink-muted">
        <h2 className="font-display text-xl font-semibold text-ink">
          3. How We Use Your Information
        </h2>
        <p>
          Your information is used strictly to authenticate your account, allow you to create or
          join exchanges, calculate random pairings that honor exclusions, display wishlists to
          assigned santas, route Anonymous Q&amp;A messages, and safeguard the platform from abuse.
          We do not sell personal data, display third-party advertisements, or use your data to train
          external machine learning models.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed text-ink-muted">
        <h2 className="font-display text-xl font-semibold text-ink">
          4. Who Can See Your Information
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-medium text-ink">Public invite previews:</strong> Visiting an
            invite link displays only public exchange metadata (title, description, budget, date,
            status, and total participant count). Participant names and wishlists are never exposed
            to unauthenticated or non-member visitors.
          </li>
          <li>
            <strong className="font-medium text-ink">Within an exchange group:</strong> Other
            members and the organizer can see your display name, wishlist items, dislikes, and
            delivery notes. Your account email address is kept private and not shown to other
            members, and exclusion rules are visible only to the organizer.
          </li>
          <li>
            <strong className="font-medium text-ink">Match secrecy &amp; Anonymous Q&amp;A:</strong>{' '}
            Database Row-Level Security (RLS) policies strictly enforce that each participant can
            only query their own outgoing assignment. Recipients cannot see who drew them, and
            organizers cannot inspect pairings through the application interface.
          </li>
          <li>
            <strong className="font-medium text-ink">Infrastructure &amp; Hosting:</strong> Data is
            stored in managed serverless PostgreSQL databases (Neon) and served via modern cloud
            hosting infrastructure. Database access is strictly governed by automated policies and
            principle of least privilege.
          </li>
        </ul>
      </section>

      <section className="space-y-3 text-sm leading-relaxed text-ink-muted">
        <h2 className="font-display text-xl font-semibold text-ink">
          5. Retention, Deletion &amp; Your Rights
        </h2>
        <p>
          While an exchange is open, you may edit your wishlist, update notes, or leave the exchange
          at any time. Organizers may delete open exchanges or reset drawn exchanges (which permanently
          removes existing pairings and Anonymous Q&amp;A messages). If you wish to permanently
          delete your account or associated data, you can submit a request through the project&apos;s
          community repository or contact the project maintainers.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed text-ink-muted">
        <h2 className="font-display text-xl font-semibold text-ink">
          6. Open Source Transparency
        </h2>
        <p>
          Àjọfún is free and open-source software under the MIT License. The complete source code,
          including database schema definitions and security policies, is publicly auditable. If
          you deploy your own self-hosted instance, you act as the operator and data controller for
          your respective deployment.
        </p>
      </section>

      <div className="border-t border-hairline pt-6 text-xs text-ink-muted">
        Related:{' '}
        <Link to="/terms" className="font-medium text-pine underline-offset-2 hover:underline">
          Terms of Use
        </Link>
      </div>
    </article>
  );
}
