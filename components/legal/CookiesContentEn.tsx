import { Link } from '../../i18n/navigation';
import { LegalSection, LegalTable } from '../LegalPage';
import { CookiePreferencesButton } from '../CookiePreferencesButton';
import { CONTACT_EMAIL, SITE_NAME } from '../../lib/siteConfig';

/**
 * English cookie policy body: a faithful translation of CookiesContentTh for review.
 * Keep sections, tables and links in step with the Thai version.
 */
export function CookiesContentEn() {
  return (
    <>
      <LegalSection id="what" heading="1. What cookies are, and what we use instead">
        <p>
          A cookie is a small text file a website stores in your browser and sends back to the server with every
          request. {SITE_NAME} uses just one cookie, to record your consent choice. Other gameplay data is kept in{' '}
          <strong>localStorage</strong> and <strong>sessionStorage</strong>, which stay on your device and are{' '}
          <strong>not</strong> sent to the server automatically. This policy covers both.
        </p>
      </LegalSection>

      <LegalSection id="necessary" heading="2. Strictly necessary (cannot be turned off)">
        <LegalTable label="Strictly necessary storage items">
          <table>
            <caption className="sr-only">Strictly necessary storage items</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Purpose</th>
                <th scope="col">Lifetime</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>beatdrop_consent</code>
                </td>
                <td>Cookie (first-party)</td>
                <td>Remembers whether you allowed or refused the optional categories</td>
                <td>180 days</td>
              </tr>
              <tr>
                <td>
                  <code>beatdrop_locale</code>
                </td>
                <td>Cookie (first-party)</td>
                <td>Remembers the language you picked in the language menu</td>
                <td>1 year</td>
              </tr>
              <tr>
                <td>
                  <code>beatdrop_admin_key</code>
                </td>
                <td>sessionStorage</td>
                <td>Holds the admin key for the session, only for people who open the admin page</td>
                <td>Cleared when the tab closes</td>
              </tr>
              <tr>
                <td>
                  <code>beatdrop_lb_sub_*</code>
                </td>
                <td>sessionStorage</td>
                <td>Prevents submitting the same score to the leaderboard twice in one session</td>
                <td>Cleared when the tab closes</td>
              </tr>
            </tbody>
          </table>
        </LegalTable>
      </LegalSection>

      <LegalSection id="preferences" heading="3. Preferences (requires consent)">
        <p>
          Every item uses the <code>songspot:</code> prefix in localStorage and is deleted immediately when you turn
          this category off.
        </p>
        <LegalTable label="Storage items for preferences">
          <table>
            <caption className="sr-only">Storage items for preferences</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>songspot:theme-id</code>, <code>songspot:sync-difficulty-accent</code>
                </td>
                <td>Your color theme and whether the accent follows difficulty</td>
              </tr>
              <tr>
                <td>
                  <code>songspot:time-range-preset</code>, <code>songspot:custom-stages</code>
                </td>
                <td>Your snippet length preset and custom values</td>
              </tr>
              <tr>
                <td>
                  <code>songspot:streak</code>, <code>songspot:best-streak</code>,{' '}
                  <code>songspot:fastest-time</code>
                </td>
                <td>Your personal stats</td>
              </tr>
              <tr>
                <td>
                  <code>songspot:played-ids</code>
                </td>
                <td>Recently played songs, to reduce repeats</td>
              </tr>
              <tr>
                <td>
                  <code>songspot:daily-category</code>, <code>songspot:daily-difficulty</code>,{' '}
                  <code>songspot:daily-active-round</code>
                </td>
                <td>Your Daily Challenge choices and progress on this device</td>
              </tr>
              <tr>
                <td>
                  <code>songspot:custom-artists</code>
                </td>
                <td>Artists you added on this device</td>
              </tr>
              <tr>
                <td>
                  <code>songspot:player-name</code>
                </td>
                <td>The name you submit scores with, so you don&rsquo;t have to retype it</td>
              </tr>
            </tbody>
          </table>
        </LegalTable>
        <p>
          <strong>Note:</strong> turning this category off does not delete scores you have{' '}
          <em>already submitted to the leaderboard</em>, because those are in our database. To have them deleted,
          see <Link href="/privacy#rights">Your rights</Link>.
        </p>
      </LegalSection>

      <LegalSection id="analytics" heading="4. Analytics (requires consent)">
        <p>
          {SITE_NAME} <strong>does not currently use</strong> any analytics tools, and this category is off by
          default. We list it in advance for transparency. If we add aggregated, anonymous measurement in the future,
          it will only run when you turn this category on, and we will update this page and ask for your consent
          again before it starts.
        </p>
      </LegalSection>

      <LegalSection id="third-party" heading="5. Third-party content">
        <p>
          Some parts of the page load resources from other domains, and those providers see your IP address and
          User-Agent. We do not embed advertising trackers.
        </p>
        <ul>
          <li>
            <strong>Apple iTunes</strong> — audio previews and album artwork
          </li>
          <li>
            <strong>Google Fonts</strong> — the Noto Sans Thai font
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="manage" heading="6. How to manage consent">
        <ul>
          <li>Use the button below to open the settings panel. You can change your choice at any time.</li>
          <li>Delete cookies and site data in your browser to reset everything and be asked for consent again.</li>
          <li>
            If you block all cookies in your browser, the game still works, but your settings won&rsquo;t be
            remembered and we will ask for consent on every visit.
          </li>
        </ul>
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
          <CookiePreferencesButton />
          <Link
            href="/privacy"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2.5 text-xs font-extrabold no-underline transition hover:bg-white/5"
            style={{ borderColor: 'var(--song-border)', color: 'var(--song-text)' }}
          >
            Read the Privacy Policy
          </Link>
        </div>
      </LegalSection>

      <LegalSection id="contact" heading="7. Contact us">
        <p>
          For questions about cookies or personal data, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </LegalSection>
    </>
  );
}
