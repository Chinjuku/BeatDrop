import { Link } from '../../i18n/navigation';
import { LegalSection, LegalTable } from '../LegalPage';
import { CookiePreferencesButton } from '../CookiePreferencesButton';
import { CONTACT_EMAIL, SITE_NAME } from '../../lib/siteConfig';

/**
 * English privacy policy body: a faithful translation of PrivacyContentTh for review.
 * Keep sections, tables and links in step with the Thai version.
 */
export function PrivacyContentEn() {
  return (
    <>
      <LegalSection id="scope" heading="1. Scope and data controller">
        <p>
          This policy applies to the {SITE_NAME} web app and the APIs on the same domain. It does not cover
          external websites we link to. For questions or to exercise your rights, contact{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p>
          <strong>We have no user accounts.</strong> You do not need to give a name, email or phone number to play.
        </p>
      </LegalSection>

      <LegalSection id="data" heading="2. Data we collect">
        <LegalTable label="Data type, purpose, storage location and retention">
          <table>
            <caption className="sr-only">Data type, purpose, storage location and retention</caption>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Purpose</th>
                <th scope="col">Stored in</th>
                <th scope="col">Retention</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Game settings (theme, snippet length, mode, category, difficulty)</td>
                <td>Remember your choices when you come back</td>
                <td>localStorage on your device</td>
                <td>Until you delete it or withdraw consent for &ldquo;Preferences&rdquo;</td>
              </tr>
              <tr>
                <td>Personal stats (streak, best streak, fastest time, recently played songs)</td>
                <td>Show your progress and avoid repeating songs</td>
                <td>localStorage on your device</td>
                <td>As above</td>
              </tr>
              <tr>
                <td>The player name you type and your Daily Challenge score</td>
                <td>Shown on the public leaderboard</td>
                <td>Our database (Supabase, PostgreSQL)</td>
                <td>Kept as competition records until you ask us to delete them</td>
              </tr>
              <tr>
                <td>Round token (HMAC signature of a game round)</td>
                <td>Verify answers and timing on the server to prevent cheating</td>
                <td>Passed between your browser and the API</td>
                <td>Expires when the round ends</td>
              </tr>
              <tr>
                <td>Cookie consent choice</td>
                <td>Remember which categories you allowed or refused</td>
                <td>
                  The <code>beatdrop_consent</code> cookie (first-party)
                </td>
                <td>180 days</td>
              </tr>
              <tr>
                <td>Technical request data (IP, User-Agent, path, time)</td>
                <td>Security, rate limiting and debugging</td>
                <td>Hosting provider logs (Vercel) and Upstash Redis</td>
                <td>Per the provider&rsquo;s log retention, generally no more than 30 days</td>
              </tr>
            </tbody>
          </table>
        </LegalTable>
        <p>
          <strong>We do not collect</strong> payment details, precise location, contacts, microphone audio or
          legally sensitive data, and we do not sell your data to anyone.
        </p>
      </LegalSection>

      <LegalSection id="legal-basis" heading="3. Legal basis">
        <ul>
          <li>
            <strong>Necessary to provide the service you request</strong> — creating game rounds, checking answers
            and submitting scores you choose to submit
          </li>
          <li>
            <strong>Legitimate interests</strong> — system security and preventing cheating and abuse
          </li>
          <li>
            <strong>Consent</strong> — remembering settings on your device and anonymous usage statistics, which
            you can withdraw at any time
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="third-parties" heading="4. Third-party service providers">
        <ul>
          <li>
            <strong>Vercel</strong> — hosts the web app and API (request logs)
          </li>
          <li>
            <strong>Supabase</strong> — PostgreSQL database for the song catalog, artists and leaderboard
          </li>
          <li>
            <strong>Upstash Redis</strong> — caching and rate limiting (when enabled)
          </li>
          <li>
            <strong>Apple iTunes Search API</strong> — source of song data and public audio previews. When your
            browser loads an audio preview or album artwork, Apple may see your IP address
          </li>
          <li>
            <strong>Google Fonts</strong> — the Noto Sans Thai font, loaded from Google&rsquo;s servers
          </li>
        </ul>
        <p>We do not use any advertising networks or cross-site trackers.</p>
      </LegalSection>

      <LegalSection id="children" heading="5. Minors">
        <p>
          {SITE_NAME} is suitable for players of all ages and does not specifically aim to collect data from
          children. Please do not enter a real name, email or other identifying information as your leaderboard
          player name, because that name is shown publicly.
        </p>
      </LegalSection>

      <LegalSection id="rights" heading="6. Your rights">
        <ul>
          <li>Request access to, correction of, or deletion of data we hold in our database, such as your leaderboard name</li>
          <li>Withdraw consent for optional cookies/storage at any time</li>
          <li>Object to processing based on legitimate interests</li>
          <li>Complain to the data protection authority in your country</li>
        </ul>
        <p>
          You can delete all data stored on your device yourself by refusing the &ldquo;Preferences&rdquo; category
          or clearing site data in your browser. For other requests, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We will reply within 30 days.
        </p>
      </LegalSection>

      <LegalSection id="security" heading="7. Security">
        <p>
          All data is transferred over HTTPS. Scores and timing are verified on the server with HMAC-signed tokens,
          and secret keys are kept only as server-side environment variables, never sent to the browser. No system
          is perfectly secure, however; if you find a vulnerability, please let us know by email.
        </p>
      </LegalSection>

      <LegalSection id="changes" heading="8. Changes to this policy">
        <p>
          If we make material changes, we will update the date above and ask for your consent again when needed.
        </p>
      </LegalSection>

      <LegalSection id="controls" heading="9. Manage your consent">
        <p>
          Open the settings panel here, or from the &ldquo;Cookie settings&rdquo; link at the bottom of every page.
        </p>
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
          <CookiePreferencesButton />
          <Link
            href="/cookies"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2.5 text-xs font-extrabold no-underline transition hover:bg-white/5"
            style={{ borderColor: 'var(--song-border)', color: 'var(--song-text)' }}
          >
            Read the Cookie Policy
          </Link>
        </div>
      </LegalSection>
    </>
  );
}
