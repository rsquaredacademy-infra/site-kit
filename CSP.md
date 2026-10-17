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

## Phase B Directives (Zoho Campaigns Sign-up)

`rsa-signup.js` submits with `fetch`, so it needs only a `connect-src` origin. No `form-action` is required (there is no native form POST) and no Zoho `script-src` is needed (no Zoho script is ever loaded).

```http
connect-src: https://zgnp-zngp.maillist-manage.com
```

### Directive Breakdown

| Directive | Required Origin | Purpose |
|---|---|---|
| `connect-src` | `https://zgnp-zngp.maillist-manage.com` | Allows the simple CORS `fetch` POST to the Zoho Campaigns quick-form endpoint (`/weboptin.zc`). |
| `form-action` | *not needed* | The sign-up uses `fetch`, not a native form submission. |
| `script-src` | *not needed* | No Zoho JavaScript is loaded. |

---

## Configuration Examples

### Netlify (`_headers` file)

```http
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://www.googletagmanager.com; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://zgnp-zngp.maillist-manage.com; img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com; style-src 'self' 'unsafe-inline';
```

### HTML Meta Tag (`<head>`)

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' https://www.googletagmanager.com;
  connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://zgnp-zngp.maillist-manage.com;
  img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com;
  style-src 'self' 'unsafe-inline';
">
```
