# TVShop frontend

This folder contains the cleaned static **Home 6** export. The imported theme DOM,
inline layout styles, slider configuration and theme scripts are intentionally kept
intact so the visual result remains equivalent to the original page.

## Run and verify

Requires Node.js 20 or newer. No package installation is needed.

```bash
npm run dev
npm test
```

The local server listens on `http://127.0.0.1:4173` by default. Set `PORT` to use
another port.

## Node.js CMS integration contract

- Render `index.html` as the home template or split it into header, main and footer
  partials using the `data-cms-region` attributes.
- Replace fields marked with `data-cms-field` and SEO values marked with
  `data-cms-meta` / `data-cms-schema` during server-side rendering.
- Set `data-cms-connected="true"` on `<html>` after the API routes below are live.
- Implement these endpoints: `/api/auth/login`, `/api/currency`,
  `/api/newsletter`, and `/api/wp-compat` (temporary theme compatibility bridge).
- Resolve clean content routes such as `/shop/`, `/product-category/.../`,
  `/blog/`, and `/my-account/` from the CMS/router.
- Generate absolute canonical, Open Graph image and JSON-LD URLs from the production
  origin. Also generate `sitemap.xml` and add its absolute URL to `robots.txt`.

`assets/wp-content` and `assets/wp-includes` are static vendor lineage only. There
is no WordPress/PHP runtime in this frontend.
