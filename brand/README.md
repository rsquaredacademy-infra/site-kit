# Rsquared Academy brand kit

The approved master is `_source/rsquared-logo.svg`; use the optimised `logo/rsquared-logo.svg` for production. The logo artwork contains its own gradients: preserve them and its proportions.

| Use | Asset |
| --- | --- |
| Site header | `logo/rsquared-lockup.svg` or its 850 × 160 PNG; on light backgrounds. |
| Favicon and installed app | Publish `favicon/` and copy `favicon/head-snippet.html` into the page head. |
| Open Graph | Edit the tagline in `og/og-template.svg` and export at 1200 × 630; `og/og-default.png` is an example. Set the page's `og:image` to the published image URL. |
| Video | Use the transparent `logo/rsquared-logo-1024.png` or `-2048.png` at native proportions. |
| Social image | Use the OG template or a suitably sized transparent PNG from `logo/`. |
| pkgdown navbar | Use `logo/rsquared-lockup.svg` on a light navbar; check it at the navbar's rendered size. |
| Quarto book | Use the lockup in a light navbar; include `tokens/brand.scss` in the theme and publish the favicon files. |

The lockup and OG wordmarks are outlined in Schibsted Grotesk at weight 700. The OG template tagline remains editable live text in `"Source Sans 3", "Segoe UI", system-ui, sans-serif`; load Source Sans 3 before exporting. The default PNG uses the website’s tagline.

Fonts: Schibsted Grotesk + Source Sans 3 (SIL OFL), load from Google Fonts or self-host.

Keep clear space around the logo of at least one quarter of its displayed width on every side. Use the standalone mark at 32 px or larger in normal layouts (the 16 px favicon is an exception); use the lockup at 160 px wide or larger and verify readability. Place it on a plain background with enough contrast, and preserve the supplied transparent margins.

Do not recolour, stretch, distort, add effects to, or substitute an old raster for the approved mark. Package hex logos are product logos and remain distinct; chart data palettes are separate from these brand UI tokens.

`tokens/brand.css`, `brand.json`, `brand.scss`, and `brand.R` carry the same light-theme values. They mirror the www site's tokens; `brand-active` is a kit fallback equal to hover because the site has no separate active token. The SCSS also maps common Bootstrap/Quarto variables; load it as a Quarto SCSS theme. Font files are not bundled. The manifest is a template: its root-relative URLs and `start_url` assume deployment at `/`; adjust them and the head snippet together for other mount points.
