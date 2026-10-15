const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  EEA_REGIONS,
  isEuropeanTimeZone,
  shouldShowBanner,
  getCookieDomain,
  parseConsentCookie,
  formatConsentCookie
} = require('../rsa-analytics.js');

describe('site-kit v1.0.0 unit tests', () => {
  describe('EEA region list', () => {
    test('contains exactly 32 country codes (30 EEA + GB + CH)', () => {
      assert.strictEqual(EEA_REGIONS.length, 32);
      // No duplicate entries
      const uniqueSet = new Set(EEA_REGIONS);
      assert.strictEqual(uniqueSet.size, 32);
    });

    test('contains all 27 EU member states', () => {
      const eu27 = [
        'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
        'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
        'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
      ];
      for (const code of eu27) {
        assert.ok(
          EEA_REGIONS.includes(code),
          `Expected EEA_REGIONS to include EU member state ${code}`
        );
      }
    });

    test('contains EFTA states in EEA (IS, LI, NO)', () => {
      assert.ok(EEA_REGIONS.includes('IS'), 'Expected IS (Iceland) in EEA_REGIONS');
      assert.ok(EEA_REGIONS.includes('LI'), 'Expected LI (Liechtenstein) in EEA_REGIONS');
      assert.ok(EEA_REGIONS.includes('NO'), 'Expected NO (Norway) in EEA_REGIONS');
    });

    test('contains United Kingdom (GB) and Switzerland (CH)', () => {
      assert.ok(EEA_REGIONS.includes('GB'), 'Expected GB in EEA_REGIONS');
      assert.ok(EEA_REGIONS.includes('CH'), 'Expected CH in EEA_REGIONS');
    });

    test('every region is a 2-letter uppercase ISO code', () => {
      for (const code of EEA_REGIONS) {
        assert.match(code, /^[A-Z]{2}$/, `${code} is not a valid 2-letter code`);
      }
    });
  });

  describe('Time zone detection and banner decision', () => {
    test('isEuropeanTimeZone returns true for Europe/* timezones', () => {
      const europeanZones = [
        'Europe/London',
        'Europe/Berlin',
        'Europe/Paris',
        'Europe/Rome',
        'Europe/Madrid',
        'Europe/Warsaw',
        'Europe/Athens',
        'Europe/Amsterdam',
        'Europe/Dublin',
        'Europe/Vienna'
      ];
      for (const tz of europeanZones) {
        assert.strictEqual(isEuropeanTimeZone(tz), true, `Failed for ${tz}`);
      }
    });

    test('isEuropeanTimeZone returns true for Atlantic islands under EEA regulations', () => {
      assert.strictEqual(isEuropeanTimeZone('Atlantic/Canary'), true);
      assert.strictEqual(isEuropeanTimeZone('Atlantic/Madeira'), true);
      assert.strictEqual(isEuropeanTimeZone('Atlantic/Reykjavik'), true);
    });

    test('isEuropeanTimeZone returns false for non-European timezones', () => {
      const nonEuropeanZones = [
        'America/New_York',
        'America/Los_Angeles',
        'America/Chicago',
        'America/Sao_Paulo',
        'Asia/Kolkata',
        'Asia/Tokyo',
        'Asia/Singapore',
        'Australia/Sydney',
        'Africa/Cairo',
        'UTC',
        'Etc/UTC'
      ];
      for (const tz of nonEuropeanZones) {
        assert.strictEqual(isEuropeanTimeZone(tz), false, `Failed for ${tz}`);
      }
    });

    test('isEuropeanTimeZone handles invalid or empty inputs safely', () => {
      assert.strictEqual(isEuropeanTimeZone(''), false);
      assert.strictEqual(isEuropeanTimeZone(null), false);
      assert.strictEqual(isEuropeanTimeZone(undefined), false);
      assert.strictEqual(isEuropeanTimeZone(123), false);
    });

    test('shouldShowBanner shows banner when time zone is European and no choice is stored', () => {
      assert.strictEqual(shouldShowBanner('Europe/London', null), true);
      assert.strictEqual(shouldShowBanner('Europe/Berlin', undefined), true);
      assert.strictEqual(shouldShowBanner('Atlantic/Canary', null), true);
      assert.strictEqual(shouldShowBanner('Atlantic/Madeira', null), true);
      assert.strictEqual(shouldShowBanner('Atlantic/Reykjavik', null), true);
    });

    test('shouldShowBanner does not show banner when non-European time zone', () => {
      assert.strictEqual(shouldShowBanner('America/New_York', null), false);
      assert.strictEqual(shouldShowBanner('Asia/Kolkata', null), false);
      assert.strictEqual(shouldShowBanner('Australia/Sydney', null), false);
      assert.strictEqual(shouldShowBanner('', null), false);
      assert.strictEqual(shouldShowBanner(null, null), false);
    });

    test('shouldShowBanner suppresses banner when a choice is already stored', () => {
      // European timezone, but user already granted consent
      assert.strictEqual(shouldShowBanner('Europe/London', 'granted'), false);
      assert.strictEqual(shouldShowBanner('Europe/Berlin', 'granted'), false);
      assert.strictEqual(shouldShowBanner('Atlantic/Reykjavik', 'granted'), false);

      // European timezone, but user already denied consent
      assert.strictEqual(shouldShowBanner('Europe/London', 'denied'), false);
      assert.strictEqual(shouldShowBanner('Europe/Paris', 'denied'), false);
      assert.strictEqual(shouldShowBanner('Atlantic/Canary', 'denied'), false);
    });
  });

  describe('Cookie domain derivation', () => {
    test('derives .rsquaredacademy.com for rsquaredacademy subdomains and root', () => {
      assert.strictEqual(
        getCookieDomain('blog.rsquaredacademy.com'),
        '.rsquaredacademy.com'
      );
      assert.strictEqual(
        getCookieDomain('www.rsquaredacademy.com'),
        '.rsquaredacademy.com'
      );
      assert.strictEqual(
        getCookieDomain('courses.rsquaredacademy.com'),
        '.rsquaredacademy.com'
      );
      assert.strictEqual(
        getCookieDomain('sub.deep.rsquaredacademy.com'),
        '.rsquaredacademy.com'
      );
      assert.strictEqual(
        getCookieDomain('rsquaredacademy.com'),
        '.rsquaredacademy.com'
      );
    });

    test('derives .aravindhebbali.com for aravindhebbali subdomains and root', () => {
      assert.strictEqual(
        getCookieDomain('www.aravindhebbali.com'),
        '.aravindhebbali.com'
      );
      assert.strictEqual(
        getCookieDomain('blog.aravindhebbali.com'),
        '.aravindhebbali.com'
      );
      assert.strictEqual(
        getCookieDomain('aravindhebbali.com'),
        '.aravindhebbali.com'
      );
    });

    test('returns null (none) for localhost and loopback/IP addresses', () => {
      assert.strictEqual(getCookieDomain('localhost'), null);
      assert.strictEqual(getCookieDomain('127.0.0.1'), null);
      assert.strictEqual(getCookieDomain('::1'), null);
      assert.strictEqual(getCookieDomain('localhost:3000'), null);
      assert.strictEqual(getCookieDomain('127.0.0.1:8080'), null);
    });

    test('returns null for multi-tenant deployment domains', () => {
      assert.strictEqual(getCookieDomain('site.netlify.app'), null);
      assert.strictEqual(getCookieDomain('user.github.io'), null);
      assert.strictEqual(getCookieDomain('app.pages.dev'), null);
    });

    test('handles empty or non-string inputs safely', () => {
      assert.strictEqual(getCookieDomain(''), null);
      assert.strictEqual(getCookieDomain(null), null);
      assert.strictEqual(getCookieDomain(undefined), null);
    });
  });

  describe('Stored-choice cookie parsing and formatting', () => {
    test('parses granted and denied from single cookie strings', () => {
      assert.strictEqual(parseConsentCookie('rsa_consent=granted'), 'granted');
      assert.strictEqual(parseConsentCookie('rsa_consent=denied'), 'denied');
    });

    test('parses rsa_consent when surrounded by other cookies', () => {
      assert.strictEqual(
        parseConsentCookie('user_id=123; rsa_consent=granted; theme=dark'),
        'granted'
      );
      assert.strictEqual(
        parseConsentCookie('rsa_consent=denied; session_token=xyz'),
        'denied'
      );
      assert.strictEqual(
        parseConsentCookie('pref=abc; rsa_consent=denied'),
        'denied'
      );
    });

    test('returns null for missing, malformed or invalid cookie values', () => {
      assert.strictEqual(parseConsentCookie(''), null);
      assert.strictEqual(parseConsentCookie(null), null);
      assert.strictEqual(parseConsentCookie(undefined), null);
      assert.strictEqual(parseConsentCookie('rsa_consent='), null);
      assert.strictEqual(parseConsentCookie('rsa_consent=invalid'), null);
      assert.strictEqual(parseConsentCookie('rsa_consent_backup=granted'), null);
    });

    test('formatConsentCookie constructs valid cookie string with domain and secure on https', () => {
      const cookieStr = formatConsentCookie(
        'granted',
        'blog.rsquaredacademy.com',
        true
      );
      assert.ok(cookieStr.includes('rsa_consent=granted'));
      assert.ok(cookieStr.includes('Path=/'));
      assert.ok(cookieStr.includes('Max-Age=15552000'));
      assert.ok(cookieStr.includes('SameSite=Lax'));
      assert.ok(cookieStr.includes('; Secure'));
      assert.ok(cookieStr.includes('; Domain=.rsquaredacademy.com'));
    });

    test('formatConsentCookie constructs valid cookie without Domain attribute on localhost', () => {
      const cookieStr = formatConsentCookie('denied', 'localhost', false);
      assert.ok(cookieStr.includes('rsa_consent=denied'));
      assert.ok(cookieStr.includes('Path=/'));
      assert.ok(cookieStr.includes('Max-Age=15552000'));
      assert.ok(cookieStr.includes('SameSite=Lax'));
      assert.ok(!cookieStr.includes('Domain='));
      assert.ok(!cookieStr.includes('Secure'));
    });
  });
});
