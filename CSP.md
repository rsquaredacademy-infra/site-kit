# Content Security Policy (CSP) Directives

To allow Google Analytics 4 and Google Consent Mode v2 to function under a strict Content Security Policy without console violations, add the following directives to your site's CSP configuration.

## Phase A Directives (Analytics + Consent)

Append these sources to your existing CSP directives:

```http
script-src:  https://www.googletagmanager.com
connect-src: https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com
img-src:      https://*.google-analytics.com https://*.googletagmanager.com
style-src:    'self'
```

### Directive Breakdown

| Directive | Required Origins | Purpose |
|---|---|---|
| `script-src` | `https://www.googletagmanager.com` | Loads `gtag.js` asynchronously. Because `rsa-analytics.js` is loaded from an external file, no `'unsafe-inline'` or script hashes are needed for the site-kit. |
| `connect-src` | `https://*.google-analytics.com`<br>`https://*.analytics.google.com`<br>`https://www.googletagmanager.com` | Allows GA4 `fetch`/XHR beacon collection requests (`/g/collect`). |
| `img-src` | `https://*.google-analytics.com`<br>`https://*.googletagmanager.com` | Fallback tracking pixel endpoints when beaconing falls back to image requests. |
| `style-src` | `'self'` | Loads `rsa-consent.css` locally without external fonts or inline CSS hacks. |

---

## Phase B Preview (Zoho Campaigns Sign-up Form)

> **Note:** As of the 2026-10-15 brief update, sign-up forms in Phase B use **Zoho Campaigns** (replacing listmonk). Once Phase B is deployed, the CSP will require Zoho's endpoints for form submission:
> - `form-action`: `https://*.zohocampaigns.com` (or Zoho's configured hosted endpoint)
> - `connect-src`: Zoho API / form submission endpoint

---

## Configuration Examples

### Netlify (`_headers` file)

```http
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://www.googletagmanager.com; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com; img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com; style-src 'self' 'unsafe-inline';
```

### HTML Meta Tag (`<head>`)

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' https://www.googletagmanager.com;
  connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com;
  img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com;
  style-src 'self' 'unsafe-inline';
">
```
