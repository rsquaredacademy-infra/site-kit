/**
 * Rsquared Academy Site-Kit — Email Sign-up (Phase B)
 * Version: v1.1.0
 *
 * Dependency-free email newsletter sign-up that posts straight to Zoho
 * Campaigns with a simple CORS `fetch` request (no Zoho script), renders the
 * result inline, and tags each contact with the site it came from
 * (custom field CONTACT_CF1 = "Signup site").
 *
 * Drop a container element with the `[data-rsa-signup]` attribute on any page.
 * Whatever markup the author puts inside it is treated as a no-JS fallback and
 * is replaced once this script runs.
 *
 * The pure helpers below are exported for Node.js unit tests. The browser
 * behaviour lives inside the guarded block near the bottom of the file.
 */

// Zoho Campaigns quick-form submission endpoint.
const ZOHO_ENDPOINT = 'https://zgnp-zngp.maillist-manage.com/weboptin.zc';

// Fixed hidden fields required by the Zoho Campaigns quick-form endpoint.
const ZOHO_HIDDEN_FIELDS = {
  submitType: 'optinCustomView',
  emailReportId: '',
  formType: 'QuickForm',
  zx: '126630e09',
  zcvers: '3.0',
  oldListIds: '',
  mode: 'OptinCreateView',
  zcld: '117e9dae2c8129085',
  zctd: '',
  zc_trackCode: 'ZCFORMVIEW',
  zc_formIx:
    '3z4a0e76496630b2bec6ad39127e0d973ece8e7e9dc0df5f42a50f782dd2aad4b0'
};

// Maximum length kept for the optional visitor-supplied text fields.
const MAX_TEXT_LENGTH = 100;

/**
 * Converts a value to a trimmed string, capped at `maxLength` characters.
 * Returns an empty string for null/undefined input.
 *
 * @param {*} value
 * @param {number} maxLength
 * @returns {string}
 */
function normaliseText(value, maxLength) {
  if (value == null) return '';
  return String(value).trim().slice(0, maxLength);
}

/**
 * Builds the URL-encoded request body for a Zoho Campaigns sign-up.
 *
 * The visitor fields are CONTACT_EMAIL (required), FIRSTNAME (optional) and
 * CONTACT_CF1 (the "Signup site" custom field). The fixed hidden fields are
 * appended unchanged.
 *
 * @param {{ email?: string, firstName?: string, site?: string }} [fields]
 * @returns {URLSearchParams}
 */
function buildSignupBody({ email, firstName, site } = {}) {
  const body = new URLSearchParams();
  body.set('CONTACT_EMAIL', email == null ? '' : String(email).trim());
  body.set('FIRSTNAME', normaliseText(firstName, MAX_TEXT_LENGTH));
  body.set('CONTACT_CF1', normaliseText(site, MAX_TEXT_LENGTH));
  for (const key of Object.keys(ZOHO_HIDDEN_FIELDS)) {
    body.set(key, ZOHO_HIDDEN_FIELDS[key]);
  }
  return body;
}

/**
 * Decodes the small set of HTML entities Zoho uses inside its JSON island.
 * `&amp;` is decoded last so an encoded entity is never double-decoded.
 *
 * @param {string} value
 * @returns {string}
 */
function decodeHtmlEntities(value) {
  return value
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Parses the JSON island returned by the Zoho Campaigns endpoint.
 *
 * The response is HTTP 200 HTML containing a JSON object between
 * `##ZCJSONSTART##` and `##ZCJSON##`, with double quotes encoded as `&#34;`.
 * A successful response has `spmSubmit: false` and a non-empty `emailid`;
 * `isNewContact` distinguishes a brand-new contact from an existing one.
 * Anything unparseable, missing the island, or carrying an error flag returns
 * `ok: false`. This function never throws.
 *
 * @param {*} text
 * @returns {{ ok: boolean, isNew: boolean, raw: object|null }}
 */
function parseZohoResponse(text) {
  try {
    if (typeof text !== 'string') {
      return { ok: false, isNew: false, raw: null };
    }
    const startMarker = '##ZCJSONSTART##';
    const endMarker = '##ZCJSON##';
    const startIndex = text.indexOf(startMarker);
    if (startIndex === -1) {
      return { ok: false, isNew: false, raw: null };
    }
    const from = startIndex + startMarker.length;
    const endIndex = text.indexOf(endMarker, from);
    if (endIndex === -1) {
      return { ok: false, isNew: false, raw: null };
    }
    const jsonText = decodeHtmlEntities(text.slice(from, endIndex).trim());
    const raw = JSON.parse(jsonText);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, isNew: false, raw: null };
    }
    const hasEmail =
      typeof raw.emailid === 'string' && raw.emailid.trim().length > 0;
    const ok = hasEmail && !raw.spmSubmit;
    return { ok, isNew: ok && raw.isNewContact === true, raw };
  } catch (e) {
    return { ok: false, isNew: false, raw: null };
  }
}

/**
 * Pragmatic email check: exactly one `@`, a non-empty local part, a dotted
 * domain, no whitespace and at most 254 characters.
 *
 * @param {*} str
 * @returns {boolean}
 */
function isValidEmail(str) {
  if (typeof str !== 'string') return false;
  const email = str.trim();
  if (email.length === 0 || email.length > 254) return false;
  if (/\s/.test(email)) return false;
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return false;
  if (email.indexOf('@', atIndex + 1) !== -1) return false;
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (local.length === 0 || domain.length === 0) return false;
  if (!domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  if (domain.includes('..')) return false;
  return true;
}

/**
 * Cheap bot heuristic: a filled honeypot or a form submitted less than
 * 2000 ms after it was rendered. A missing/blank honeypot and a missing or
 * large `elapsedMs` are treated as human.
 *
 * @param {{ honeypotValue?: string, elapsedMs?: number }} [signals]
 * @returns {boolean}
 */
function isLikelyBot({ honeypotValue, elapsedMs } = {}) {
  if (honeypotValue != null && String(honeypotValue).trim() !== '') {
    return true;
  }
  if (typeof elapsedMs === 'number' && elapsedMs < 2000) {
    return true;
  }
  return false;
}

/**
 * Default value for the "Signup site" tag: the hostname plus the first path
 * segment, when there is one.
 *
 * Rule: strip any query string/hash, split the path on `/`, drop empty
 * segments, and join the hostname with the first remaining segment using a
 * single `/`. Examples:
 *   ('rsquaredacademy.com', '/olsrr')                  -> 'rsquaredacademy.com/olsrr'
 *   ('olsrr.rsquaredacademy.com', '/articles/x.html')  -> 'olsrr.rsquaredacademy.com/articles'
 *   ('rsquaredacademy.com', '/')                       -> 'rsquaredacademy.com'
 *
 * @param {*} hostname
 * @param {*} pathname
 * @returns {string}
 */
function defaultSiteLabel(hostname, pathname) {
  const host = typeof hostname === 'string' ? hostname.trim() : '';
  const rawPath = typeof pathname === 'string' ? pathname.split(/[?#]/)[0] : '';
  const segments = rawPath.split('/').filter(function (part) {
    return part.length > 0;
  });
  if (host && segments.length > 0) {
    return host + '/' + segments[0];
  }
  return host;
}

/**
 * Browser runtime execution
 */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  (function initRsaSignupRuntime() {
    let instanceCounter = 0;

    // Inline status messages shown to the visitor.
    const MESSAGE = {
      new: 'Almost done: check your inbox for a confirmation email.',
      existing: "You're already subscribed. Thank you!",
      error: "Sorry, that didn't work. Please try again in a minute.",
      invalid: 'Please enter a valid email address.',
      pending: 'Subscribing\u2026'
    };

    // Sends the anonymous GA4 sign_up event. Never includes the email or name.
    function trackSignup(site) {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'sign_up', {
          method: 'zoho_campaigns',
          signup_site: site
        });
      }
    }

    // Creates an element with an optional class and text content.
    function makeElement(tagName, className, text) {
      const el = document.createElement(tagName);
      if (className) el.className = className;
      if (text != null) el.textContent = text;
      return el;
    }

    // Builds a labelled input field, returning both wrapper and input.
    function buildField(options) {
      const field = makeElement('div', 'rsa-signup__field');
      const label = makeElement('label', 'rsa-signup__label', options.label);
      label.setAttribute('for', options.id);
      if (options.optional) {
        label.appendChild(
          makeElement('span', 'rsa-signup__optional', ' (optional)')
        );
      }
      const input = document.createElement('input');
      input.className = 'rsa-signup__input';
      input.id = options.id;
      input.name = options.name;
      input.type = options.type;
      if (options.autocomplete) {
        input.setAttribute('autocomplete', options.autocomplete);
      }
      if (options.required) input.required = true;
      field.appendChild(label);
      field.appendChild(input);
      return { field: field, input: input };
    }

    // Renders the sign-up form into a container element.
    function renderForm(container) {
      const renderedAt = Date.now();
      instanceCounter += 1;
      const uid = 'rsa-signup-' + instanceCounter;

      const site =
        (container.getAttribute('data-site') || '').trim() ||
        defaultSiteLabel(window.location.hostname, window.location.pathname);
      const headingText =
        container.getAttribute('data-heading') ||
        'Get updates from Rsquared Academy';
      const bodyText =
        container.getAttribute('data-text') ||
        'New courses, eBook chapters and R package releases. Free. Unsubscribe any time.';
      const buttonLabel = container.getAttribute('data-button') || 'Subscribe';
      const showName = container.getAttribute('data-name') !== 'off';
      const headingAsParagraph =
        container.getAttribute('data-heading-level') === 'p';
      const privacyUrl = container.getAttribute('data-privacy-url') || '/privacy/';

      const headingId = uid + '-heading';
      const emailId = uid + '-email';
      const nameId = uid + '-name';
      const honeypotId = uid + '-website';
      const statusId = uid + '-status';

      // Replace whatever fallback markup the author placed inside.
      container.textContent = '';
      container.classList.add('rsa-signup');

      const headingEl = makeElement(
        headingAsParagraph ? 'p' : 'h2',
        'rsa-signup__heading',
        headingText
      );
      headingEl.id = headingId;

      const textEl = makeElement('p', 'rsa-signup__text', bodyText);

      const form = document.createElement('form');
      form.className = 'rsa-signup__form';
      form.setAttribute('novalidate', '');
      form.setAttribute('aria-labelledby', headingId);

      const emailField = buildField({
        id: emailId,
        name: 'email',
        type: 'email',
        autocomplete: 'email',
        label: 'Email address',
        required: true
      });

      const nameField = showName
        ? buildField({
            id: nameId,
            name: 'firstName',
            type: 'text',
            autocomplete: 'given-name',
            label: 'First name',
            optional: true,
            required: false
          })
        : null;

      // Honeypot: off-screen via CSS (never display:none) and never focusable.
      const honeypot = makeElement('div', 'rsa-signup__hp');
      honeypot.setAttribute('aria-hidden', 'true');
      const honeypotLabel = makeElement('label', null, 'Website');
      honeypotLabel.setAttribute('for', honeypotId);
      const honeypotInput = document.createElement('input');
      honeypotInput.id = honeypotId;
      honeypotInput.name = 'website';
      honeypotInput.type = 'text';
      honeypotInput.tabIndex = -1;
      honeypotInput.setAttribute('autocomplete', 'off');
      honeypot.appendChild(honeypotLabel);
      honeypot.appendChild(honeypotInput);

      const button = makeElement(
        'button',
        'rsa-signup__button',
        buttonLabel
      );
      button.type = 'submit';

      const status = makeElement('p', 'rsa-signup__status');
      status.id = statusId;
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');

      function setStatus(message, kind) {
        status.textContent = message;
        status.classList.remove(
          'rsa-signup__status--error',
          'rsa-signup__status--success'
        );
        if (kind === 'error') {
          status.classList.add('rsa-signup__status--error');
        } else if (kind === 'success') {
          status.classList.add('rsa-signup__status--success');
        }
      }

      form.appendChild(emailField.field);
      if (nameField) form.appendChild(nameField.field);
      form.appendChild(honeypot);
      form.appendChild(button);
      form.appendChild(status);

      const privacy = makeElement('p', 'rsa-signup__privacy');
      const privacyLink = makeElement('a', 'rsa-signup__privacy-link', 'Privacy');
      privacyLink.href = privacyUrl;
      privacy.appendChild(privacyLink);

      container.appendChild(headingEl);
      container.appendChild(textEl);
      container.appendChild(form);
      container.appendChild(privacy);

      form.addEventListener('submit', function (event) {
        event.preventDefault();

        const email = emailField.input.value;
        const firstName = nameField ? nameField.input.value : '';

        if (
          isLikelyBot({
            honeypotValue: honeypotInput.value,
            elapsedMs: Date.now() - renderedAt
          })
        ) {
          // Silently accept the submission without contacting Zoho.
          setStatus(MESSAGE.new, 'success');
          return;
        }

        if (!isValidEmail(email)) {
          setStatus(MESSAGE.invalid, 'error');
          emailField.input.setAttribute('aria-invalid', 'true');
          emailField.input.setAttribute('aria-describedby', statusId);
          try {
            emailField.input.focus();
          } catch (e) {
            // Ignore focus failures.
          }
          return;
        }

        emailField.input.removeAttribute('aria-invalid');
        emailField.input.removeAttribute('aria-describedby');
        button.disabled = true;
        setStatus(MESSAGE.pending, null);

        const body = buildSignupBody({ email, firstName, site });

        fetch(ZOHO_ENDPOINT, {
          method: 'POST',
          body: body,
          mode: 'cors',
          credentials: 'omit'
        })
          .then(function (response) {
            if (!response.ok) {
              throw new Error('Unexpected HTTP status ' + response.status);
            }
            return response.text();
          })
          .then(function (text) {
            const result = parseZohoResponse(text);
            button.disabled = false;
            if (!result.ok) {
              setStatus(MESSAGE.error, 'error');
              return;
            }
            if (result.isNew) {
              setStatus(MESSAGE.new, 'success');
              form.reset();
              trackSignup(site);
            } else {
              setStatus(MESSAGE.existing, 'success');
            }
          })
          .catch(function () {
            button.disabled = false;
            setStatus(MESSAGE.error, 'error');
          });
      });
    }

    // Renders every not-yet-initialised container on the page.
    function init() {
      const containers = document.querySelectorAll('[data-rsa-signup]');
      for (let i = 0; i < containers.length; i += 1) {
        const container = containers[i];
        if (container.hasAttribute('data-rsa-signup-ready')) continue;
        container.setAttribute('data-rsa-signup-ready', '');
        renderForm(container);
      }
    }

    window.RsaSignup = { init: init };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  })();
}

// Export functions for Node.js unit tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ZOHO_ENDPOINT,
    ZOHO_HIDDEN_FIELDS,
    buildSignupBody,
    parseZohoResponse,
    isValidEmail,
    isLikelyBot,
    defaultSiteLabel
  };
}
