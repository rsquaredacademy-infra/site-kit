const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  ZOHO_ENDPOINT,
  ZOHO_HIDDEN_FIELDS,
  buildSignupBody,
  parseZohoResponse,
  isValidEmail,
  isLikelyBot,
  defaultSiteLabel,
  pickFormParts
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

describe('site-kit v1.1.0 sign-up unit tests', () => {
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
      'buildSignupBody',
      'parseZohoResponse',
      'isValidEmail',
      'isLikelyBot',
      'defaultSiteLabel',
      'pickFormParts'
    ];

    test('exposes the v1.1.0 names plus pickFormParts', () => {
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
});
