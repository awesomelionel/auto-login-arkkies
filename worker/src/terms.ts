/**
 * Bump TERMS_VERSION when the terms change. The page stores this value in
 * localStorage and asks again when it no longer matches. Update
 * TERMS_EFFECTIVE_DATE in the same change.
 */
export const TERMS_VERSION = "2026-11-12";

/** Shown on /terms. This is the date the current version took effect. */
export const TERMS_EFFECTIVE_DATE = "12 November 2026";

export function termsAcceptanceError(value: unknown): string | null {
  const accepted = typeof value === "string" ? value.trim() : "";
  if (accepted === TERMS_VERSION) return null;
  return `Accept the current Terms of Use (version ${TERMS_VERSION}) before booking or opening a door. Send acceptedTerms with that version.`;
}

/** Body of /terms, without the shared page chrome. */
export function termsArticleHtml(): string {
  return `<p class="lede">Version ${TERMS_VERSION}. Effective ${TERMS_EFFECTIVE_DATE}.</p>
    <article class="prose">
      <p>These terms apply to the Arkkies Auto Login tool on this website (the "tool"), operated by Lionel Tan (the "operator").</p>
      <p>If you tick "I agree to the Terms of Use" and use Book &amp; Open Door or Open Door, you agree to these terms. If you do not agree, do not use the tool.</p>

      <h2>Unofficial tool</h2>
      <p>This tool is unofficial. It is not affiliated with, endorsed by, or provided by Arkkies or ARK. It is free. It is provided as is and as available. There is no warranty. It may stop working, produce the wrong result, or be discontinued at any time, without notice.</p>

      <h2>Your account</h2>
      <p>You use your own Arkkies account. You are solely responsible for that account, including keeping the password to yourself, following Arkkies' own terms, and following the gym's rules. Use the tool only for gyms and time slots that your own membership entitles you to.</p>

      <h2>Prohibited uses</h2>
      <p>You must not:</p>
      <ul>
        <li>use another person's username or password unless they have allowed you to use their account</li>
        <li>let non-members in, or help anyone tailgate through a door</li>
        <li>get around access controls, membership limits, or booking rules</li>
        <li>abuse the tool or a gym</li>
        <li>send automated or mass requests</li>
        <li>use the tool for anything unlawful</li>
      </ul>

      <h2>Credentials and logs</h2>
      <p>The tool does not store your password. This site has no database of accounts. Your browser may remember, on your own device, your username, the last gym you chose, your home gym, and the version of these terms you accepted. It does not remember the password.</p>
      <p>The password is sent in the body of that one request, used to call Arkkies, and then discarded. It is not written to Workers KV, D1, R2, or similar storage.</p>
      <p>Cloudflare runs this code. Cloudflare terminates HTTPS and handles the request in memory while it is processed. Cloudflare's logs store request metadata, including the HTTP method and the URL, for a short retention period. That is not a copy of the password, as long as the password stays in the request body and not in the URL. Do not put a password in the URL.</p>
      <p>Whoever operates a copy of this tool can change that copy. If you did not deploy it yourself, you are trusting the person who did.</p>

      <h2>Liability</h2>
      <p>To the maximum extent permitted by law, the operator is not liable for lost access, missed or failed bookings, account suspension, injury, loss of property, or anything that results from misuse of the tool, or from the tool failing, being wrong, or being unavailable. Nothing in these terms excludes or limits liability that the law of Singapore does not allow to be excluded or limited.</p>

      <h2>Indemnity</h2>
      <p>You indemnify and hold harmless the operator (Lionel Tan) against claims, losses, and reasonable costs arising from your use of the tool, your misuse of it, or your breach of these terms.</p>

      <h2>Access and changes</h2>
      <p>The operator may block or withdraw access to the tool at any time.</p>
      <p>The operator may change these terms by publishing a new version on this page. The version is the date shown above. When the version changes, the tool asks you to accept the new terms before you can book or open a door again. Using the tool after you accept a version means you agree to that version.</p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of Singapore.</p>

      <h2>Contact</h2>
      <p>Contact the operator: [add an email address here].</p>
    </article>`;
}
