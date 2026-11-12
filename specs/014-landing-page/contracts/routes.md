# Route contract

| Path | Setting off (default) | Setting on |
| --- | --- | --- |
| `/` | Login screen (today); signed in: start page | Landing (no session cookie); signed in: start page; expired cookie: landing |
| `/login` | Login screen | Login screen |
| `/signup` | unchanged; "Entrar" goes to `/login` | same |
| private page, signed out | `/login` | `/login` |
| `/robots.txt` | `User-agent: *`, `Disallow: /` | `User-agent: *`, `Allow: /$`, `Disallow: /` |

Head of `/` when on: `title`, `description`, `link rel=canonical` = `<origin>/`, `og:title`, `og:description`, `og:url`, `og:type=website`, `og:locale=pt_BR`, `og:image` = `<origin>/icon-512.png`, `twitter:card=summary`, `robots=index, follow`.
