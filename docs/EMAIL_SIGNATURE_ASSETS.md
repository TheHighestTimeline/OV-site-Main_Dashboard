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

Two lockups. **OneVibeMediaGroup** is the full mark; **OneVibeMedia** is the
same artwork with the "Group" cut off, for the OVM entity.

| Lockup | Variant | URL |
|---|---|---|
| OneVibeMediaGroup | black | `https://ovmgdashboard.netlify.app/signature/ovmg-logo.png` |
| OneVibeMediaGroup | white | `https://ovmgdashboard.netlify.app/signature/ovmg-logo-white.png` |
| OneVibeMedia | black | `https://ovmgdashboard.netlify.app/signature/ovm-logo.png` |
| OneVibeMedia | white | `https://ovmgdashboard.netlify.app/signature/ovm-logo-white.png` |

Black on light backgrounds, white on dark. All four are 108px tall PNG, RGBA,
trimmed to the mark with no dead padding — same height on purpose, so the two
lockups carry the same visual weight when swapped. Widths differ with the
aspect ratio: OVMG is 800px (7.42:1), OVM is 568px (5.26:1). Serving at ~4x
the display height keeps them sharp on retina.

## Snippet

```html
<!-- OneVibeMediaGroup -->
<img src="https://ovmgdashboard.netlify.app/signature/ovmg-logo.png"
     alt="OneVibeMediaGroup" height="28" width="207"
     style="display:block;height:28px;width:207px;border:0;" />

<!-- OneVibeMedia -->
<img src="https://ovmgdashboard.netlify.app/signature/ovm-logo.png"
     alt="OneVibeMedia" height="28" width="147"
     style="display:block;height:28px;width:147px;border:0;" />
```

The width attributes are the mark's real width at a 28px height, precomputed
from each aspect ratio. Set both `width` and `height` to those exact numbers or
neither — anything else stretches the mark. `width="auto"` is not a valid HTML
attribute value and leaves the logo at its natural size in Outlook, which drops
CSS on images often enough that the attributes have to carry real numbers.

`alt` matters: Outlook blocks remote images by default and shows the alt text
instead.

## The Signature builder

`src/views/Signature.jsx` has a **Brand lockup** switcher above the company
line. Picking a lockup swaps the logo, its width, and its alt text in the
generated signature, and rewrites the company line — but only when that line
still holds a brand default. A hand-typed company line ("OneVibe Media Group
LLC", a department name) survives the switch untouched.

The builder embeds a small offline copy of each lockup, used only when the
hosted URL cannot be reached while the preview renders. The copied signature
always references the hosted URL: a data URI survives the clipboard, but Gmail
and Outlook both strip it on send, so a signature built around one arrives with
a broken image.

## Replacing the artwork

Overwrite the file in `public/signature/` and push. The URLs are deliberately
not content-hashed so existing signatures keep working; `Cache-Control` is one
week rather than the immutable year used for `/assets/*`, so a swap propagates
instead of stranding every sent signature on the old file.

Regenerate from the master (`public/ovmg-logo.png`, black on transparent)
rather than editing by hand. The white variant is an RGB inversion with the
alpha channel left alone, per the OVMG brand recipe, and the OVM crop is taken
at the one fully transparent column between "Media" and "Group":

```python
from PIL import Image

src  = Image.open('public/ovmg-logo.png').convert('RGBA')
full = src.crop(src.split()[-1].getbbox())        # drop the padding: 1729x233

def emit(im, stem, h=108):
    im = im.crop(im.split()[-1].getbbox())
    im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    r, g, b, a = im.split()
    inv = lambda ch: ch.point(lambda v: 255 - v)
    im.save('public/signature/%s.png' % stem, optimize=True)
    Image.merge('RGBA', (inv(r), inv(g), inv(b), a)) \
         .save('public/signature/%s-white.png' % stem, optimize=True)

emit(full, 'ovmg-logo')
emit(full.crop((0, 0, 1227, full.height)), 'ovm-logo')
```

If the master ever changes, re-find the cut column rather than reusing 1227 —
it is the minimum of the per-column ink sum between "Media" and "Group", not a
round number:

```python
a = full.split()[-1]; px = a.load()
ink = [sum(px[x, y] for y in range(full.height)) for x in range(full.width)]
print(min(range(1150, 1330), key=lambda x: ink[x]))
```

Regenerating the builder's offline fallbacks is a separate step — they are
base64 blobs inside `Signature.jsx`, quantized to 32 colours at 84px tall.

## Gmail dark mode

A transparent black mark sits on whatever background the client paints, and
Gmail's dark mode paints a dark one — the black lockup goes nearly invisible
there. There is no single file that solves this: dark-mode-aware signatures
need a `prefers-color-scheme` media query, which Gmail strips. If dark mode
becomes a real complaint, the fix is a third variant with a baked-in white
background, accepting the white box on dark, not a change to these.
