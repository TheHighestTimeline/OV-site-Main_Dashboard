# Email signature assets

Logo files hosted for hotlinking from email signatures. They live in
`public/signature/`, so Vite copies them into `dist/` verbatim and Netlify
serves them straight from the site root.

Nothing in the dashboard UI links to them. They are invisible in the sense
that matters: no nav entry, no route, and `X-Robots-Tag: noindex, noimageindex`
on `/signature/*` (see `netlify.toml`) keeps them out of search results. They
are still publicly readable by URL, which is the whole point — an email client
rendering a signature is an anonymous request with no session.

## URLs

| Variant | URL | Use on |
|---|---|---|
| Black on transparent | `https://ovmgdashboard.netlify.app/signature/ovmg-logo.png` | light backgrounds (normal mail) |
| White on transparent | `https://ovmgdashboard.netlify.app/signature/ovmg-logo-white.png` | dark backgrounds |

Both are 800x108 PNG, RGBA, trimmed to the mark with no dead padding. Serving
at 800px wide and displaying at ~200px keeps it sharp on retina screens.

## Snippet

Set `width` only. Never set both `width` and `height` — the 7.42:1 aspect ratio
has to stay intact. The `alt` text matters because Outlook blocks remote images
by default and shows the alt text instead.

```html
<img src="https://ovmgdashboard.netlify.app/signature/ovmg-logo.png"
     alt="OneVibeMediaGroup"
     width="200"
     style="width:200px;max-width:200px;height:auto;border:0;display:block;" />
```

## Replacing the artwork

Overwrite the file in `public/signature/` and push. The URL is deliberately not
content-hashed so existing signatures keep working; `Cache-Control` is one week
rather than the immutable year used for `/assets/*`, so a swap propagates
instead of stranding every sent signature on the old file.

Regenerate both variants from the master (`public/ovmg-logo.png`, black on
transparent) rather than editing them by hand — the white variant is an RGB
inversion with the alpha channel left alone, per the OVMG brand recipe:

```python
from PIL import Image

src = Image.open('public/ovmg-logo.png').convert('RGBA')
black = src.crop(src.split()[-1].getbbox())          # drop the padding first
black = black.resize((800, round(black.height * 800 / black.width)), Image.LANCZOS)

r, g, b, a = black.split()
inv = lambda ch: ch.point(lambda v: 255 - v)
white = Image.merge('RGBA', (inv(r), inv(g), inv(b), a))

black.save('public/signature/ovmg-logo.png', optimize=True)
white.save('public/signature/ovmg-logo-white.png', optimize=True)
```

## Gmail dark mode

A transparent black mark sits on whatever background the client paints, and
Gmail's dark mode paints a dark one — the black lockup goes nearly invisible
there. There is no single file that solves this: dark-mode-aware signatures
need a `prefers-color-scheme` media query, which Gmail strips. If dark mode
becomes a real complaint, the fix is a third variant with a baked-in white
background, accepting the white box on dark, not a change to these two.
