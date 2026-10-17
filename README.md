# Rsquared Academy Site-Kit

Shared analytics, consent, and funnel toolkit for [Rsquared Academy](https://rsquaredacademy.com) websites and [Aravind Hebbali](https://aravindhebbali.com) web properties.

**Version:** `v1.2.0` (Phase A: GA4 + region-based Consent Mode v2 · Phase B: Zoho Campaigns email sign-up · enhance an existing form)

---

## 1. What It Is

`site-kit` is a single-source, dependency-free toolkit vendored across 24 Rsquared Academy and Aravind Hebbali web properties (Quarto sites, Quarto books, pkgdown documentation, and static HTML).

Phase A provides:
- **Zero-inline GA4 loader (`rsa-analytics.js`):** Reads the Google Analytics Measurement ID directly from its own `data-ga-id` script attribute, eliminating inline scripts and preserving strict Content Security Policies without hash management.
- **Google Consent Mode v2:** Registers standard default signals before any tags fire, denying ad and personalization signals while respecting privacy directives by region.
- **Accessible, non-intrusive consent banner:** An accessible dialog (`role="dialog"`) styled via `rsa-consent.css`, fixed to the viewport bottom to prevent layout shift.
- **Cross-subdomain cookie persistence:** Stores consent choice in a 180-day cookie scoped to the registrable root domain (`.rsquaredacademy.com` or `.aravindhebbali.com`), ensuring visitors make their choice once across all subdomains.
- **Universal opt-out hook:** Any element with `data-rsa-analytics-optout` immediately revokes analytics consent and displays a confirmation notification.

---

## 2. Email Sign-up (Phase B)

`rsa-signup.js` + `rsa-signup.css` add a dependency-free newsletter sign-up card that posts straight to **Zoho Campaigns** with `fetch` — no third-party Zoho script, no inline JavaScript, and no `'unsafe-inline'` needed.

### Container Markup

Drop a container anywhere in the page body; whatever fallback markup the author puts inside is replaced when the script runs:

```html
<div data-rsa-signup></div>
```

### Container Attributes (all optional)

| Attribute | Default | Purpose |
|---|---|---|
| `data-site` | hostname + first path segment | Value stored in the Zoho **Signup site** custom field (`CONTACT_CF1`). |
| `data-heading` | `Get updates from Rsquared Academy` | Card heading text. |
| `data-text` | `New courses, eBook chapters and R package releases. Free. Unsubscribe any time.` | Short supporting paragraph. |
| `data-button` | `Subscribe` | Submit button label. |
| `data-name` | shown | Set to `off` to hide the optional first-name field. |
| `data-privacy-url` | `/privacy/` | Target of the small "Privacy" link under the form. |
| `data-heading-level` | `h2` | Set to `p` to render the heading as a paragraph instead. |

### Enhance an Existing Form

If a site already has an approved, design-system sign-up band, don't let the kit draw its own card: put `data-rsa-signup` on the existing `<form>` and the kit keeps the author's markup and styles, wiring up only the validation, Zoho submission, inline message and GA4 event.

```html
<form data-rsa-signup data-site="edusite" novalidate>
  <label for="news-email">Email address</label>
  <input id="news-email" type="email" name="email" autocomplete="email" required>

  <!-- Optional first-name field -->
  <input type="text" name="firstName" data-rsa-signup-name>

  <!-- Optional honeypot; hide it yourself, the kit adds none -->
  <div hidden>
    <input type="text" name="website" tabindex="-1" autocomplete="off" data-rsa-signup-hp>
  </div>

  <button type="submit">Subscribe</button>

  <!-- Optional; created and appended by the kit if absent -->
  <p data-rsa-signup-status>No spam. Unsubscribe any time.</p>
</form>
```

- The kit **does not** style the form or add a class; the host page's CSS owns the look, so `rsa-signup.css` is **not** needed.
- The kit **does not** add its own honeypot in this mode (it would be visible without the kit styles); supply one with `data-rsa-signup-hp` if you want the check.
- Only `data-site` is read from the form; `data-heading`, `data-text`, `data-button`, `data-name` and `data-privacy-url` are ignored.
- The three hooks are all optional: `data-rsa-signup-name` (first name), `data-rsa-signup-hp` (honeypot) and `data-rsa-signup-status` (live region). The email input is the form's first `input[type="email"]`; without one the form is left untouched.
- The status element is given an id, `role="status"` and `aria-live="polite"` automatically. Style its states with `.rsa-signup__status--error` and `.rsa-signup__status--success`, the same classes the rendered card uses.
- Submitting behaves exactly as in render mode (same messages, error/success classes, `sign_up` event), including the 2-second minimum fill time, measured from when the script attaches to the form.

The script creates **no globals** except `window.RsaSignup` (its `init()` method).

### What the Visitor Sees

A compact card with a heading, one line of copy, a labelled email field, an optional first-name field, a Subscribe button and a small Privacy link. On submit the component validates the address, disables the button, then shows the outcome inline in a polite live region:

- **New contact:** "Almost done: check your inbox for a confirmation email." (form is reset)
- **Existing contact:** "You're already subscribed. Thank you!"
- **Error:** "Sorry, that didn't work. Please try again in a minute."

**Double opt-in** is enabled in Zoho, so Zoho sends the confirmation email; a contact only becomes active once they click the link.

A hidden honeypot field and a 2-second minimum fill time silently reject obvious bots without contacting Zoho.

### GA4 `sign_up` Event

On a successful **new** sign-up the component calls `gtag('event', 'sign_up', { method: 'zoho_campaigns', signup_site: <site> })` when `window.gtag` is available. Google Consent Mode already governs storage, so the component does not check consent itself. The email address and name are **never** sent to Google.

### Where the Contact Lands

Contacts are added to the Zoho Campaigns list **"Rsquared Academy Updates"**, tagged with the site they signed up on in the **Signup site** field (`CONTACT_CF1`).

Pages that inject containers after load can call `window.RsaSignup.init()`; already-rendered containers are marked with `data-rsa-signup-ready` and skipped.

---

## 3. Consent Behavior in Plain Words

1. **Non-European visitors (worldwide):**
   - If the visitor's time zone is outside Europe (e.g., `America/New_York`, `Asia/Kolkata`, `Australia/Sydney`), **no banner is displayed**.
   - Google Analytics Consent Mode defaults allow aggregated analytics measurement while keeping advertising signals permanently denied.

2. **European visitors (EEA, UK, Switzerland):**
   - If the visitor's time zone starts with `Europe/` or is `Atlantic/Canary`, `Atlantic/Madeira`, or `Atlantic/Reykjavik`, and no prior choice exists, **the banner is shown**.
   - Analytics cookies and storage remain denied until the visitor makes a choice.
   - **Accept:** Clicking Accept saves `rsa_consent=granted`, updates `analytics_storage` to `granted`, and removes the banner.
   - **Decline:** Clicking Decline saves `rsa_consent=denied`, updates `analytics_storage` to `denied`, and removes the banner.
   - **Keyboard Navigation & Escape:** The dialog receives focus upon render. Tabbing cycles between buttons. Pressing the <kbd>Escape</kbd> key immediately declines consent and dismisses the banner.

3. **Subsequent Page Loads:**
   - The stored choice (`rsa_consent=granted` or `rsa_consent=denied`) is read from the cookie and immediately applied via `gtag('consent', 'update', ...)` on every page load.
   - Because a choice is already recorded, the banner is never re-displayed.

4. **Opt-Out Link:**
   - Clicking any element with `data-rsa-analytics-optout` (such as in the footer or on the privacy page) immediately revokes consent (`analytics_storage: 'denied'`), updates the cookie to `denied`, and displays an accessible toast confirmation.

---

## 4. Brand Measurement IDs

| Property | Measurement ID | Target Sites |
|---|---|---|
| Rsquared Academy | `G-2QSPEL5WM6` | `*.rsquaredacademy.com` (edusite, blog, ebooks, pkgdown documentation, courses) |
| Aravind Hebbali | `G-7JN5Q48PQP` | `aravindhebbali.com`, `blog.aravindhebbali.com` |

---

## 5. How to Vendor Into Each Platform

Copy `rsa-analytics.js` and `rsa-consent.css` into your repository's static assets directory (e.g., `site-kit/`). Sites that show the sign-up form also copy `rsa-signup.js` and `rsa-signup.css`, add the two extra tags below, add `https://zgnp-zngp.maillist-manage.com` to the CSP `connect-src` (see `CSP.md`), and place `<div data-rsa-signup></div>` where the form should appear.

### Quarto Websites & Books

1. Copy `rsa-analytics.js` and `rsa-consent.css` into your Quarto project under `site-kit/`.
2. Copy `includes/quarto-head.html` to your project (or reference it directly).
3. In `_quarto.yml`, add the header snippet under `format.html`:

```yaml
format:
  html:
    include-in-header:
      - site-kit/includes/quarto-head.html
```

Header snippet content:
```html
<link rel="stylesheet" href="/site-kit/rsa-consent.css">
<script src="/site-kit/rsa-analytics.js" data-ga-id="G-2QSPEL5WM6" async></script>
<!-- sign-up sites only: -->
<link rel="stylesheet" href="/site-kit/rsa-signup.css">
<script src="/site-kit/rsa-signup.js" defer></script>
```

### pkgdown Documentation Sites

1. Copy `rsa-analytics.js` and `rsa-consent.css` into `pkgdown/assets/site-kit/`.
2. Configure `_pkgdown.yml`:

```yaml
template:
  includes:
    in_header: pkgdown/templates/in-header.html
```

Or configure directly inline:
```yaml
template:
  includes:
    in_header: |
      <link rel="stylesheet" href="/site-kit/rsa-consent.css">
      <script src="/site-kit/rsa-analytics.js" data-ga-id="G-2QSPEL5WM6" async></script>
<!-- sign-up sites only: -->
<link rel="stylesheet" href="/site-kit/rsa-signup.css">
<script src="/site-kit/rsa-signup.js" defer></script>
```

### Plain HTML & Static Sites

Add these two tags inside `<head>`:
```html
<link rel="stylesheet" href="/site-kit/rsa-consent.css">
<script src="/site-kit/rsa-analytics.js" data-ga-id="G-2QSPEL5WM6" async></script>
<!-- sign-up sites only: -->
<link rel="stylesheet" href="/site-kit/rsa-signup.css">
<script src="/site-kit/rsa-signup.js" defer></script>
```

Add an opt-out link in your footer or privacy policy page:
```html
<a href="#" data-rsa-analytics-optout>Cookie preferences &amp; Opt-out</a>
```

---

## 6. Privacy Policy & CSP Documentation

- **Privacy Policy Statement:** See [`privacy-snippet.md`](./privacy-snippet.md) for the exact paragraph to add to site privacy policy pages.
- **Content Security Policy:** See [`CSP.md`](./CSP.md) for required directives (`script-src`, `connect-src`, `img-src`) and Netlify header examples.

---

## 7. Testing & Quality Checks

### Run Unit Tests
```bash
node --test test/
```
The test suite validates:
- Complete EEA + UK + CH region list (32 country codes).
- Time zone to banner decision logic (`Europe/*`, Atlantic islands, overseas).
- Root domain derivation (`blog.rsquaredacademy.com` &rarr; `.rsquaredacademy.com`, `localhost` &rarr; none).
- Cookie parsing, formatting, and expiration.

### Check Node.js Headless Loading
```bash
node -e "require('./rsa-analytics.js')"
```
Must load cleanly without exceptions when run outside a browser environment.

### Manual Verification
Open `test/demo.html` in a web browser. Use Chrome DevTools &rarr; *Sensors* to simulate time zones (`London`, `Berlin`, `New York`, `Tokyo`) and verify banner behavior and opt-out interactions.

---

## 8. License

MIT &copy; 2026 Rsquared Academy / Aravind Hebbali. See [`LICENSE`](./LICENSE).
