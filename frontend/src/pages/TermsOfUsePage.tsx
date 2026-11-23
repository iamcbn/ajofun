import { Link } from 'react-router-dom';

export function TermsOfUsePage() {
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
          Terms of Use
        </h1>
        <p className="text-xs text-ink-muted">
          Effective Date: November 2026 &middot; Project: Àjọfún (Open-Source Community Project) &middot;
          License: MIT
        </p>
      </div>

      <section className="space-y-3 text-sm leading-relaxed text-ink-muted">
        <h2 className="font-display text-xl font-semibold text-ink">
          1. Acceptance &amp; Eligibility
        </h2>
        <p>
          By creating an account, joining an exchange, or using Àjọfún, you agree to
          these Terms of Use and our{' '}
          <Link to="/privacy" className="font-medium text-pine underline-offset-2 hover:underline">
            Privacy Policy
          </Link>
          . You must be at least 13 years old (or the minimum digital consent age in your
          jurisdiction) to use the service, or participate under the supervision of a parent or
          legal guardian.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed text-ink-muted">
        <h2 className="font-display text-xl font-semibold text-ink">
          2. Coordination Tool Only (No Commerce or Fulfillment)
        </h2>
        <p>
          Àjọfún is strictly a coordination and organizational utility for private gift
          exchanges, wishlists, exclusion constraints, randomized name drawing, and Anonymous Q&amp;A.
          The project does not process payments, sell products, fulfill orders, ship packages, or
          guarantee that any participant will purchase, give, or deliver a gift. All gift agreements,
          spending, and physical exchanges take place entirely off-platform between individual participants.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed text-ink-muted">
        <h2 className="font-display text-xl font-semibold text-ink">
          3. Accounts &amp; Acceptable Use
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            You are responsible for maintaining the confidentiality of your account credentials.
          </li>
          <li>
            Do not use Anonymous Q&amp;A, display names, wishlists, or messages to harass, threaten,
            impersonate, spam, or abuse other participants. Anonymity exists solely for the fun of
            gift surprises and does not protect abusive or unlawful behavior.
          </li>
          <li>
            Do not submit malicious links, attempt unauthorized access, bypass match privacy
            controls, or disrupt the operation of the application.
          </li>
        </ul>
      </section>

      <section className="space-y-3 text-sm leading-relaxed text-ink-muted">
        <h2 className="font-display text-xl font-semibold text-ink">
          4. Organizer Responsibilities
        </h2>
        <p>
          Organizers are responsible for inviting only intended participants and configuring
          exclusions prior to running a draw. Resetting a drawn exchange is a permanent action that
          erases all existing pairings and Anonymous Q&amp;A message history for that exchange.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed text-ink-muted">
        <h2 className="font-display text-xl font-semibold text-ink">
          5. Open-Source Disclaimer of Warranties &amp; Limitation of Liability
        </h2>
        <p>
          As provided in the MIT License: THE SOFTWARE IS PROVIDED &ldquo;AS IS&rdquo;, WITHOUT
          WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT.
        </p>
        <p>
          IN NO EVENT SHALL THE AUTHORS, MAINTAINERS, OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
          DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING
          FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE,
          INCLUDING ANY MISSED GIFTS, DELIVERY ISSUES, OR DISPUTES AMONG PARTICIPANTS.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed text-ink-muted">
        <h2 className="font-display text-xl font-semibold text-ink">
          6. Modifications &amp; Community Governance
        </h2>
        <p>
          As an open-source project, Àjọfún may be improved or updated over time by its
          contributors. If you host or deploy your own instance of the application, you are
          responsible for the operation, configuration, and user agreements of your instance.
        </p>
      </section>

      <div className="border-t border-hairline pt-6 text-xs text-ink-muted">
        Related:{' '}
        <Link to="/privacy" className="font-medium text-pine underline-offset-2 hover:underline">
          Privacy Policy
        </Link>
      </div>
    </article>
  );
}
