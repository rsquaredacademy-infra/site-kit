# Rsquared Academy Site-Kit

Shared analytics, consent, and funnel toolkit for [Rsquared Academy](https://rsquaredacademy.com) websites and [Aravind Hebbali](https://aravindhebbali.com) web properties.

**Version:** `v1.0.0` (Phase A: GA4 + region-based Consent Mode v2)

---

## 1. What It Is

`site-kit` is a single-source, dependency-free toolkit vendored across 24 Rsquared Academy and Aravind Hebbali web properties (Quarto sites, Quarto books, pkgdown documentation, and static HTML).

Phase A provides:
- **Zero-inline GA4 loader (`rsa-analytics.js`):** Reads the Google Analytics Measurement ID directly from its own `data-ga-id` script attribute, eliminating inline scripts and preserving strict Content Security Policies without hash management.
- **Google Consent Mode v2:** Registers standard default signals before any tags fire, denying ad and personalization signals while respecting privacy directives by region.
- **Accessible, non-intrusive consent banner:** An accessible dialog (`role="dialog"`) styled via `rsa-consent.css`, fixed to the viewport bottom to prevent layout shift.
- **Cross-subdomain cookie persistence:** Stores consent choice in a 180-day cookie scoped to the registrable root domain (`.rsquaredacademy.com` or `.aravindhebbali.com`), ensuring visitors make their choice once across all subdomains.
- **Universal opt-out hook:** Any element with `data-rsa-analytics-optout` immediately revokes analytics consent and displays a confirmation notification.

*(Phase B will introduce the email newsletter sign-up component integrated with Zoho Campaigns).*

---

## 2. Consent Behavior in Plain Words

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

## 3. Brand Measurement IDs

| Property | Measurement ID | Target Sites |
|---|---|---|
| Rsquared Academy | `G-2QSPEL5WM6` | `*.rsquaredacademy.com` (edusite, blog, ebooks, pkgdown documentation, courses) |
| Aravind Hebbali | `G-7JN5Q48PQP` | `aravindhebbali.com`, `blog.aravindhebbali.com` |

---

## 4. How to Vendor Into Each Platform

Copy `rsa-analytics.js` and `rsa-consent.css` into your repository's static assets directory (e.g., `site-kit/`).

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
```

### Plain HTML & Static Sites

Add these two tags inside `<head>`:
```html
<link rel="stylesheet" href="/site-kit/rsa-consent.css">
<script src="/site-kit/rsa-analytics.js" data-ga-id="G-2QSPEL5WM6" async></script>
```

Add an opt-out link in your footer or privacy policy page:
```html
<a href="#" data-rsa-analytics-optout>Cookie preferences &amp; Opt-out</a>
```

---

## 5. Privacy Policy & CSP Documentation

- **Privacy Policy Statement:** See [`privacy-snippet.md`](./privacy-snippet.md) for the exact paragraph to add to site privacy policy pages.
- **Content Security Policy:** See [`CSP.md`](./CSP.md) for required directives (`script-src`, `connect-src`, `img-src`) and Netlify header examples.

---

## 6. Testing & Quality Checks

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

## 7. License

MIT &copy; 2026 Rsquared Academy / Aravind Hebbali. See [`LICENSE`](./LICENSE).
