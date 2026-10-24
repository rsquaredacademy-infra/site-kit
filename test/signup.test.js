const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  ZOHO_ENDPOINT,
  ZOHO_HIDDEN_FIELDS,
  VARIANT_FIELD,
  BAR_DISMISS_MS,
  buildSignupBody,
  parseZohoResponse,
  isValidEmail,
  isLikelyBot,
  defaultSiteLabel,
  pickFormParts,
  assignVariant,
  resolveVariant,
  formatVariantLabel,
  isEuropeanTimeZone,
  parseConsentCookie,
  pastScrollThreshold,
  barDismissedUntil,
  isBarDismissed
} = require('../rsa-signup.js');

// Builds a realistic Zoho HTML response around a JSON island, encoding every
// double quote as `&#34;` exactly as the live endpoint does.
function buildIslandResponse(payload) {
  const encoded = JSON.stringify(payload).replace(/"/g, '&#34;');
  return (
    '<!DOCTYPE html><html><head><title>Zoho</title></head><body>' +
    '<div class="zc-msg">##ZCJSONSTART##' +
    encoded +
    '##ZCJSON##</div>' +
    '<p>Thank you.</p></body></html>'
  );
}

describe('site-kit sign-up unit tests', () => {
  describe('constants', () => {
    test('ZOHO_ENDPOINT points at the maillist-manage quick form', () => {
      assert.strictEqual(
        ZOHO_ENDPOINT,
        'https://zgnp-zngp.maillist-manage.com/weboptin.zc'
      );
    });

    test('ZOHO_HIDDEN_FIELDS contains every fixed field', () => {
      assert.deepStrictEqual(ZOHO_HIDDEN_FIELDS, {
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
      });
    });
  });

  describe('buildSignupBody', () => {
    test('returns a URLSearchParams with the visitor and hidden fields', () => {
      const body = buildSignupBody({
        email: 'a@b.com',
        firstName: 'Ada',
        site: 'rsquaredacademy.com'
      });
      assert.ok(body instanceof URLSearchParams);
      assert.strictEqual(body.get('CONTACT_EMAIL'), 'a@b.com');
      assert.strictEqual(body.get('FIRSTNAME'), 'Ada');
      assert.strictEqual(body.get('CONTACT_CF1'), 'rsquaredacademy.com');
      for (const key of Object.keys(ZOHO_HIDDEN_FIELDS)) {
        assert.strictEqual(
          body.get(key),
          ZOHO_HIDDEN_FIELDS[key],
          `missing or wrong hidden field ${key}`
        );
      }
    });

    test('includes all three visitor fields even when only email is given', () => {
      const body = buildSignupBody({ email: 'a@b.com' });
      assert.strictEqual(body.get('CONTACT_EMAIL'), 'a@b.com');
      assert.strictEqual(body.get('FIRSTNAME'), '');
      assert.strictEqual(body.get('CONTACT_CF1'), '');
    });

    test('trims email, first name and site', () => {
      const body = buildSignupBody({
        email: '  a@b.com  ',
        firstName: '  Ada  ',
        site: '  demo-1  '
      });
      assert.strictEqual(body.get('CONTACT_EMAIL'), 'a@b.com');
      assert.strictEqual(body.get('FIRSTNAME'), 'Ada');
      assert.strictEqual(body.get('CONTACT_CF1'), 'demo-1');
    });

    test('caps the first name and site at 100 characters', () => {
      const long = 'x'.repeat(150);
      const body = buildSignupBody({
        email: 'a@b.com',
        firstName: long,
        site: long
      });
      assert.strictEqual(body.get('FIRSTNAME').length, 100);
      assert.strictEqual(body.get('CONTACT_CF1').length, 100);
      assert.strictEqual(body.get('FIRSTNAME'), 'x'.repeat(100));
    });

    test('handles missing fields and non-string values safely', () => {
      const body = buildSignupBody();
      assert.strictEqual(body.get('CONTACT_EMAIL'), '');
      assert.strictEqual(body.get('FIRSTNAME'), '');
      assert.strictEqual(body.get('CONTACT_CF1'), '');

      const numeric = buildSignupBody({ email: 42, firstName: 7, site: 9 });
      assert.strictEqual(numeric.get('CONTACT_EMAIL'), '42');
      assert.strictEqual(numeric.get('FIRSTNAME'), '7');
      assert.strictEqual(numeric.get('CONTACT_CF1'), '9');
    });

    test('serialises to a valid urlencoded string', () => {
      const body = buildSignupBody({ email: 'a@b.com', site: 'a b' });
      const serialised = body.toString();
      assert.ok(serialised.includes('CONTACT_EMAIL=a%40b.com'));
      assert.ok(serialised.includes('CONTACT_CF1=a+b'));
    });

    test('stores the experiment variant in the Signup variant field', () => {
      assert.strictEqual(VARIANT_FIELD, 'CONTACT_CF2');
      const body = buildSignupBody({
        email: 'a@b.com',
        firstName: 'Ada',
        site: 'demo-1',
        variant: 'ebook-bar-v1:B'
      });
      assert.strictEqual(body.get('CONTACT_CF2'), 'ebook-bar-v1:B');
      assert.strictEqual(body.get('CONTACT_CF1'), 'demo-1');
    });

    test('omits the variant field when no variant is given', () => {
      const expected = new URLSearchParams();
      expected.set('CONTACT_EMAIL', 'a@b.com');
      expected.set('FIRSTNAME', 'Ada');
      expected.set('CONTACT_CF1', 'demo-1');
      for (const key of Object.keys(ZOHO_HIDDEN_FIELDS)) {
        expected.set(key, ZOHO_HIDDEN_FIELDS[key]);
      }

      const body = buildSignupBody({
        email: 'a@b.com',
        firstName: 'Ada',
        site: 'demo-1'
      });

      assert.strictEqual(body.has('CONTACT_CF2'), false);
      // Byte-identical to v1.2.0: same fields, same order, same encoding.
      assert.strictEqual(body.toString(), expected.toString());
      assert.deepStrictEqual(
        Array.from(body.keys()),
        Array.from(expected.keys())
      );
    });

    test('treats blank and whitespace-only variants as no variant', () => {
      for (const variant of ['', '   ', null, undefined]) {
        const body = buildSignupBody({ email: 'a@b.com', variant });
        assert.strictEqual(body.has('CONTACT_CF2'), false);
      }
    });

    test('trims and caps the variant value like the other text fields', () => {
      const trimmed = buildSignupBody({
        email: 'a@b.com',
        variant: '  ebook-bar-v1:A  '
      });
      assert.strictEqual(trimmed.get('CONTACT_CF2'), 'ebook-bar-v1:A');

      const capped = buildSignupBody({
        email: 'a@b.com',
        variant: 'x'.repeat(150)
      });
      assert.strictEqual(capped.get('CONTACT_CF2').length, 100);
    });
  });

  describe('parseZohoResponse', () => {
    test('parses a new-contact success island', () => {
      const html = buildIslandResponse({
        spmSubmit: false,
        emailid: 'a@b.com',
        isNewContact: true
      });
      const result = parseZohoResponse(html);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.isNew, true);
      assert.ok(result.raw);
      assert.strictEqual(result.raw.emailid, 'a@b.com');
    });

    test('parses an existing-contact success island', () => {
      const html = buildIslandResponse({
        spmSubmit: false,
        emailid: 'a@b.com',
        isNewContact: false
      });
      const result = parseZohoResponse(html);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.isNew, false);
      assert.ok(result.raw);
    });

    test('parses an error island (bad or empty email)', () => {
      const html = buildIslandResponse({
        spmSubmit: true,
        emailid: '',
        isNewContact: false
      });
      const result = parseZohoResponse(html);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.isNew, false);
      assert.ok(result.raw);
    });

    test('decodes HTML entities in the island, including &amp;', () => {
      const html =
        'x##ZCJSONSTART##{&#34;spmSubmit&#34;:false,' +
        '&#34;emailid&#34;:&#34;a&amp;b@c.com&#34;,' +
        '&#34;isNewContact&#34;:false}##ZCJSON##y';
      const result = parseZohoResponse(html);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.raw.emailid, 'a&b@c.com');
    });

    test('returns a failure result when the island is missing', () => {
      const result = parseZohoResponse('<html><body>No island here</body></html>');
      assert.deepStrictEqual(result, { ok: false, isNew: false, raw: null });
    });

    test('returns a failure result when the closing marker is missing', () => {
      const result = parseZohoResponse('##ZCJSONSTART##{"spmSubmit":false}');
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.raw, null);
    });

    test('returns a failure result for malformed JSON', () => {
      const result = parseZohoResponse(
        'a##ZCJSONSTART##{&#34;spmSubmit&#34;:false, oops}##ZCJSON##b'
      );
      assert.deepStrictEqual(result, { ok: false, isNew: false, raw: null });
    });

    test('returns a failure result for an empty string', () => {
      assert.deepStrictEqual(parseZohoResponse(''), {
        ok: false,
        isNew: false,
        raw: null
      });
    });

    test('never throws and returns failure for non-string input', () => {
      for (const input of [null, undefined, 0, 42, {}, [], true]) {
        const result = parseZohoResponse(input);
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.isNew, false);
        assert.strictEqual(result.raw, null);
      }
    });

    test('treats a missing emailid as a failure even without spmSubmit', () => {
      const html = buildIslandResponse({ spmSubmit: false, isNewContact: true });
      const result = parseZohoResponse(html);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.isNew, false);
    });
  });

  describe('isValidEmail', () => {
    test('accepts pragmatic valid addresses', () => {
      const valid = [
        'a@b.com',
        'first.last@sub.domain.co',
        'user+tag@example.org',
        'a@b.c',
        'UPPER@EXAMPLE.COM',
        'name-with-dash@my-host.io'
      ];
      for (const email of valid) {
        assert.strictEqual(isValidEmail(email), true, `should accept ${email}`);
      }
    });

    test('rejects malformed addresses', () => {
      const invalid = [
        '',
        '   ',
        'a@b',
        '@b.com',
        'a@',
        'a@.com',
        'a@b.',
        'a@b..com',
        'a b@c.com',
        'a@@b.com',
        'no-at-sign.com',
        'a@b .com',
        'a@b.c om'
      ];
      for (const email of invalid) {
        assert.strictEqual(isValidEmail(email), false, `should reject ${email}`);
      }
    });

    test('rejects non-strings and over-long addresses', () => {
      assert.strictEqual(isValidEmail(null), false);
      assert.strictEqual(isValidEmail(undefined), false);
      assert.strictEqual(isValidEmail(42), false);
      const tooLong = 'a'.repeat(250) + '@b.com';
      assert.ok(tooLong.length > 254);
      assert.strictEqual(isValidEmail(tooLong), false);
    });

    test('accepts a trimmed address', () => {
      assert.strictEqual(isValidEmail('  a@b.com  '), true);
    });
  });

  describe('isLikelyBot', () => {
    test('flags a filled honeypot', () => {
      assert.strictEqual(
        isLikelyBot({ honeypotValue: 'http://spam.example', elapsedMs: 5000 }),
        true
      );
      assert.strictEqual(
        isLikelyBot({ honeypotValue: 'x', elapsedMs: 10000 }),
        true
      );
    });

    test('flags a submission faster than 2000 ms', () => {
      assert.strictEqual(
        isLikelyBot({ honeypotValue: '', elapsedMs: 100 }),
        true
      );
      assert.strictEqual(
        isLikelyBot({ honeypotValue: '', elapsedMs: 1999 }),
        true
      );
      assert.strictEqual(
        isLikelyBot({ honeypotValue: '', elapsedMs: 0 }),
        true
      );
    });

    test('treats an empty honeypot after 2000 ms as human', () => {
      assert.strictEqual(
        isLikelyBot({ honeypotValue: '', elapsedMs: 2000 }),
        false
      );
      assert.strictEqual(
        isLikelyBot({ honeypotValue: '', elapsedMs: 60000 }),
        false
      );
    });

    test('treats whitespace-only honeypots as empty', () => {
      assert.strictEqual(
        isLikelyBot({ honeypotValue: '   ', elapsedMs: 5000 }),
        false
      );
    });

    test('handles missing signals and arguments safely', () => {
      assert.strictEqual(isLikelyBot(), false);
      assert.strictEqual(isLikelyBot({}), false);
      assert.strictEqual(isLikelyBot({ honeypotValue: null }), false);
      assert.strictEqual(
        isLikelyBot({ honeypotValue: '', elapsedMs: undefined }),
        false
      );
    });
  });

  describe('defaultSiteLabel', () => {
    test('appends the first path segment to the hostname', () => {
      assert.strictEqual(
        defaultSiteLabel('rsquaredacademy.com', '/olsrr'),
        'rsquaredacademy.com/olsrr'
      );
      assert.strictEqual(
        defaultSiteLabel('olsrr.rsquaredacademy.com', '/articles/x.html'),
        'olsrr.rsquaredacademy.com/articles'
      );
      assert.strictEqual(
        defaultSiteLabel('blog.aravindhebbali.com', '/posts/2026/a.html'),
        'blog.aravindhebbali.com/posts'
      );
    });

    test('returns just the hostname for the root or empty path', () => {
      assert.strictEqual(
        defaultSiteLabel('rsquaredacademy.com', '/'),
        'rsquaredacademy.com'
      );
      assert.strictEqual(
        defaultSiteLabel('rsquaredacademy.com', ''),
        'rsquaredacademy.com'
      );
      assert.strictEqual(
        defaultSiteLabel('rsquaredacademy.com', undefined),
        'rsquaredacademy.com'
      );
    });

    test('ignores query strings, hashes and trailing slashes', () => {
      assert.strictEqual(
        defaultSiteLabel('rsquaredacademy.com', '/olsrr/'),
        'rsquaredacademy.com/olsrr'
      );
      assert.strictEqual(
        defaultSiteLabel('rsquaredacademy.com', '/olsrr?ref=home'),
        'rsquaredacademy.com/olsrr'
      );
      assert.strictEqual(
        defaultSiteLabel('rsquaredacademy.com', '/olsrr#top'),
        'rsquaredacademy.com/olsrr'
      );
      assert.strictEqual(
        defaultSiteLabel('rsquaredacademy.com', '///'),
        'rsquaredacademy.com'
      );
    });

    test('handles non-string input safely', () => {
      assert.strictEqual(defaultSiteLabel(null, '/x'), '');
      assert.strictEqual(defaultSiteLabel(undefined, undefined), '');
      assert.strictEqual(defaultSiteLabel('', '/x'), '');
      assert.strictEqual(defaultSiteLabel('host.example', 123), 'host.example');
    });
  });

  describe('module exports', () => {
    const EXPECTED_EXPORTS = [
      'ZOHO_ENDPOINT',
      'ZOHO_HIDDEN_FIELDS',
      'VARIANT_FIELD',
      'EXPERIMENT_STORAGE_PREFIX',
      'BAR_DISMISSED_KEY',
      'SIGNUP_DONE_KEY',
      'BAR_DISMISS_MS',
      'buildSignupBody',
      'parseZohoResponse',
      'isValidEmail',
      'isLikelyBot',
      'defaultSiteLabel',
      'pickFormParts',
      'assignVariant',
      'resolveVariant',
      'formatVariantLabel',
      'isEuropeanTimeZone',
      'parseConsentCookie',
      'pastScrollThreshold',
      'barDismissedUntil',
      'isBarDismissed'
    ];

    test('exposes the v1.2.0 names plus the v1.3.0 experiment helpers', () => {
      const names = Object.keys(require('../rsa-signup.js')).sort();
      assert.deepStrictEqual(names, EXPECTED_EXPORTS.slice().sort());
    });

    test('requiring the file twice returns the same export names', () => {
      const first = require('../rsa-signup.js');
      const resolved = require.resolve('../rsa-signup.js');
      delete require.cache[resolved];
      const second = require('../rsa-signup.js');
      assert.deepStrictEqual(
        Object.keys(first).sort(),
        Object.keys(second).sort()
      );
    });
  });

  describe('pickFormParts', () => {
    // Minimal fake form: it only needs `querySelector`, so these tests run
    // without a DOM library.
    function fakeForm(map) {
      return {
        querySelector(selector) {
          return Object.prototype.hasOwnProperty.call(map, selector)
            ? map[selector]
            : null;
        }
      };
    }

    test('returns the first matching element for each hook', () => {
      const emailInput = { id: 'email' };
      const nameInput = { id: 'name' };
      const honeypotInput = { id: 'hp' };
      const button = { id: 'button' };
      const statusEl = { id: 'status' };
      const parts = pickFormParts(
        fakeForm({
          'input[type="email"]': emailInput,
          '[data-rsa-signup-name]': nameInput,
          '[data-rsa-signup-hp]': honeypotInput,
          'button[type="submit"], input[type="submit"]': button,
          '[data-rsa-signup-status]': statusEl
        })
      );
      assert.strictEqual(parts.emailInput, emailInput);
      assert.strictEqual(parts.nameInput, nameInput);
      assert.strictEqual(parts.honeypotInput, honeypotInput);
      assert.strictEqual(parts.button, button);
      assert.strictEqual(parts.statusEl, statusEl);
    });

    test('returns null for every missing optional element', () => {
      const emailInput = { id: 'email' };
      const parts = pickFormParts(fakeForm({ 'input[type="email"]': emailInput }));
      assert.strictEqual(parts.emailInput, emailInput);
      assert.strictEqual(parts.nameInput, null);
      assert.strictEqual(parts.honeypotInput, null);
      assert.strictEqual(parts.button, null);
      assert.strictEqual(parts.statusEl, null);
    });

    test('returns all nulls for a non-form object', () => {
      const empty = {
        emailInput: null,
        nameInput: null,
        honeypotInput: null,
        button: null,
        statusEl: null
      };
      for (const bad of [null, undefined, 0, 'form', {}, { querySelector: 1 }]) {
        assert.deepStrictEqual(pickFormParts(bad), empty);
      }
    });
  });

  describe('assignVariant', () => {
    test('returns A for random numbers below 0.5', () => {
      for (const value of [0, 0.0001, 0.25, 0.499999]) {
        assert.strictEqual(assignVariant(value), 'A');
      }
    });

    test('returns B from 0.5 upwards', () => {
      for (const value of [0.5, 0.500001, 0.75, 0.999999]) {
        assert.strictEqual(assignVariant(value), 'B');
      }
    });

    test('falls back to Math.random for non-finite input', () => {
      for (const value of [undefined, null, NaN, Infinity, -Infinity, '0.1']) {
        assert.ok(['A', 'B'].includes(assignVariant(value)));
      }
    });
  });

  describe('resolveVariant', () => {
    function fakeStorage(initial) {
      const data = Object.assign({}, initial);
      return {
        data,
        getItem(key) {
          return Object.prototype.hasOwnProperty.call(data, key)
            ? data[key]
            : null;
        },
        setItem(key, value) {
          data[key] = String(value);
        }
      };
    }

    test('returns none without an experiment name', () => {
      assert.strictEqual(resolveVariant(), 'none');
      assert.strictEqual(resolveVariant({ experiment: '   ' }), 'none');
      assert.strictEqual(
        resolveVariant({ experiment: '', randomNumber: 0.1 }),
        'none'
      );
    });

    test('assigns and stores a variant outside consent regions', () => {
      const storage = fakeStorage();
      assert.strictEqual(
        resolveVariant({
          experiment: 'ebook-bar-v1',
          timeZone: 'Asia/Kolkata',
          randomNumber: 0.1,
          storage
        }),
        'A'
      );
      assert.strictEqual(storage.data['rsa_signup_exp_ebook-bar-v1'], 'A');

      const storageB = fakeStorage();
      assert.strictEqual(
        resolveVariant({
          experiment: 'ebook-bar-v1',
          timeZone: 'America/New_York',
          randomNumber: 0.9,
          storage: storageB
        }),
        'B'
      );
      assert.strictEqual(storageB.data['rsa_signup_exp_ebook-bar-v1'], 'B');
    });

    test('reuses a stored A or B instead of assigning again', () => {
      for (const stored of ['A', 'B']) {
        const storage = fakeStorage({ 'rsa_signup_exp_ebook-bar-v1': stored });
        // Draw the opposite variant: the stored value must still win.
        assert.strictEqual(
          resolveVariant({
            experiment: 'ebook-bar-v1',
            timeZone: 'Asia/Kolkata',
            randomNumber: stored === 'A' ? 0.99 : 0.01,
            storage
          }),
          stored
        );
        assert.strictEqual(storage.data['rsa_signup_exp_ebook-bar-v1'], stored);
      }
    });

    test('ignores invalid stored values and overwrites them', () => {
      for (const stored of ['C', 'a', '', 'AB', 'none', '0.1']) {
        const storage = fakeStorage({ 'rsa_signup_exp_ebook-bar-v1': stored });
        assert.strictEqual(
          resolveVariant({
            experiment: 'ebook-bar-v1',
            timeZone: 'Asia/Kolkata',
            randomNumber: 0.2,
            storage
          }),
          'A'
        );
        assert.strictEqual(storage.data['rsa_signup_exp_ebook-bar-v1'], 'A');
      }
    });

    test('survives a storage that throws on get and set', () => {
      const throwing = {
        getItem() {
          throw new Error('storage blocked');
        },
        setItem() {
          throw new Error('storage blocked');
        }
      };
      assert.strictEqual(
        resolveVariant({
          experiment: 'ebook-bar-v1',
          timeZone: 'Asia/Kolkata',
          randomNumber: 0.7,
          storage: throwing
        }),
        'B'
      );
    });

    test('works with null or partial storage objects', () => {
      for (const storage of [null, undefined, {}, { getItem: 1 }]) {
        assert.strictEqual(
          resolveVariant({
            experiment: 'ebook-bar-v1',
            timeZone: 'Asia/Kolkata',
            randomNumber: 0.7,
            storage
          }),
          'B'
        );
      }
    });

    test('gives European visitors without consent none, with no storage', () => {
      const calls = [];
      const storage = {
        getItem(key) {
          calls.push('get:' + key);
          return 'B';
        },
        setItem(key) {
          calls.push('set:' + key);
        }
      };
      for (const timeZone of [
        'Europe/London',
        'Europe/Berlin',
        'Europe/Lisbon',
        'Atlantic/Canary',
        'Atlantic/Madeira',
        'Atlantic/Reykjavik'
      ]) {
        assert.strictEqual(
          resolveVariant({
            experiment: 'ebook-bar-v1',
            timeZone,
            consentGranted: false,
            randomNumber: 0.9,
            storage
          }),
          'none'
        );
      }
      assert.deepStrictEqual(calls, []);
    });

    test('assigns European visitors who have granted consent', () => {
      const storage = fakeStorage();
      assert.strictEqual(
        resolveVariant({
          experiment: 'ebook-bar-v1',
          timeZone: 'Europe/Berlin',
          consentGranted: true,
          randomNumber: 0.9,
          storage
        }),
        'B'
      );
      assert.strictEqual(storage.data['rsa_signup_exp_ebook-bar-v1'], 'B');
    });

    test('honours a forced QA variant without reading or writing storage', () => {
      const calls = [];
      const storage = {
        getItem() {
          calls.push('get');
          return 'A';
        },
        setItem() {
          calls.push('set');
        }
      };
      assert.strictEqual(
        resolveVariant({
          experiment: 'ebook-bar-v1',
          timeZone: 'Europe/Berlin',
          consentGranted: false,
          storage,
          forceVariant: 'B'
        }),
        'B'
      );
      assert.deepStrictEqual(calls, []);
    });
  });

  describe('experiment formatting and consent helpers', () => {
    test('formats the variant label as <experiment>:<variant>', () => {
      assert.strictEqual(
        formatVariantLabel('ebook-bar-v1', 'B'),
        'ebook-bar-v1:B'
      );
      assert.strictEqual(
        formatVariantLabel('  ebook-bar-v1  ', ' A '),
        'ebook-bar-v1:A'
      );
      assert.strictEqual(formatVariantLabel('', 'A'), '');
      assert.strictEqual(formatVariantLabel('ebook-bar-v1', ''), '');
      assert.strictEqual(formatVariantLabel(null, undefined), '');
    });

    test('copies the European time-zone rule from rsa-analytics.js', () => {
      assert.strictEqual(isEuropeanTimeZone('Europe/London'), true);
      assert.strictEqual(isEuropeanTimeZone('Atlantic/Canary'), true);
      assert.strictEqual(isEuropeanTimeZone('America/New_York'), false);
      assert.strictEqual(isEuropeanTimeZone('Asia/Kolkata'), false);
      assert.strictEqual(isEuropeanTimeZone('Europe'), false);
      assert.strictEqual(isEuropeanTimeZone(''), false);
      assert.strictEqual(isEuropeanTimeZone(null), false);
    });

    test('parses the rsa_consent cookie', () => {
      assert.strictEqual(parseConsentCookie('rsa_consent=granted'), 'granted');
      assert.strictEqual(
        parseConsentCookie('a=1; rsa_consent=denied; b=2'),
        'denied'
      );
      assert.strictEqual(parseConsentCookie('rsa_consent=granted; x=y'), 'granted');
      assert.strictEqual(parseConsentCookie('x=rsa_consent=granted'), null);
      assert.strictEqual(parseConsentCookie('rsa_consent=maybe'), null);
      assert.strictEqual(parseConsentCookie(''), null);
      assert.strictEqual(parseConsentCookie(null), null);
    });
  });

  describe('pastScrollThreshold', () => {
    test('returns false for a page too short to scroll', () => {
      assert.strictEqual(pastScrollThreshold(0, 640, 640, 0.5), false);
      assert.strictEqual(pastScrollThreshold(100, 800, 500, 0.5), false);
    });

    test('returns false before half the document height', () => {
      // docH 4000 -> threshold 2000.
      assert.strictEqual(pastScrollThreshold(0, 640, 4000, 0.5), false);
      assert.strictEqual(pastScrollThreshold(1999, 640, 4000, 0.5), false);
    });

    test('returns false exactly at the threshold ("past" is strict)', () => {
      assert.strictEqual(pastScrollThreshold(2000, 640, 4000, 0.5), false);
    });

    test('returns true once past half the document height', () => {
      assert.strictEqual(pastScrollThreshold(2001, 640, 4000, 0.5), true);
      assert.strictEqual(pastScrollThreshold(4001, 640, 8000, 0.5), true);
    });

    test('defaults an invalid ratio to 0.5', () => {
      for (const ratio of [undefined, NaN, 0, 1, -0.5, 2, '0.5']) {
        assert.strictEqual(pastScrollThreshold(3000, 640, 4000, ratio), true);
        assert.strictEqual(pastScrollThreshold(1000, 640, 4000, ratio), false);
      }
    });

    test('returns false for invalid or negative measurements', () => {
      for (const values of [
        [NaN, 640, 4000],
        [100, undefined, 4000],
        [-1, 640, 4000],
        [100, 640, Infinity]
      ]) {
        assert.strictEqual(pastScrollThreshold(...values, 0.5), false);
      }
    });
  });

  describe('bar dismissal arithmetic', () => {
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    test('BAR_DISMISS_MS is exactly 30 days', () => {
      assert.strictEqual(BAR_DISMISS_MS, THIRTY_DAYS);
    });

    test('barDismissedUntil adds 30 days', () => {
      assert.strictEqual(barDismissedUntil(0), THIRTY_DAYS);
      assert.strictEqual(barDismissedUntil(1000), THIRTY_DAYS + 1000);
      assert.strictEqual(
        barDismissedUntil(1750000000000),
        1750000000000 + THIRTY_DAYS
      );
    });

    test('isBarDismissed is true only while the timestamp is in the future', () => {
      const now = 1750000000000;
      const until = barDismissedUntil(now);
      assert.strictEqual(isBarDismissed(until, now), true);
      assert.strictEqual(isBarDismissed(until, now + 1), true);
      assert.strictEqual(isBarDismissed(until, until - 1), true);
      assert.strictEqual(isBarDismissed(until, until), false);
      assert.strictEqual(isBarDismissed(until, until + 1), false);
      assert.strictEqual(isBarDismissed(now + 1, now), true);
      assert.strictEqual(isBarDismissed(now - 1, now), false);
    });

    test('isBarDismissed treats missing/invalid values as not dismissed', () => {
      for (const value of [null, undefined, '', 'nope', NaN, Infinity, {}]) {
        assert.strictEqual(isBarDismissed(value, Date.now()), false);
      }
    });
  });
});
