# Asset provenance

Record of where Kynd's shipped media comes from. Kept because the demo is
publicly deployed and its Terms state that photography is third-party
licensed — this is the evidence behind that statement.

## Photography

All opportunity/activity photography shipped in
`frontend/public/demo-assets/opportunities/` is derived from stock photography
obtained from **[Pexels](https://www.pexels.com)** and used under the
**[Pexels License](https://www.pexels.com/license/)** (free to use, including
commercially; attribution not required; photos may not be resold unaltered,
and identifiable people may not be depicted in a bad light or used to imply
endorsement).

The 4K/6K originals live in `Photos for Kynd/` at the repo root, which is
gitignored — only the cropped, web-sized derivatives are committed. See
`frontend/scripts/build-demo-assets.sh` for how sources map to shipped files.

Kynd does not claim ownership of any of this photography. People pictured are
not participants in Kynd and their appearance implies no endorsement.

### Replaced assets (September 5, 2026)

Two shipped images were previously derived from **iStockphoto comp/preview
URLs** (the `612x612` evaluation endpoint), which are not licensed for
publication. Both source files were deleted and the shipped images rebuilt
from Pexels sources:

| Shipped file | Source | Photographer | Page |
| --- | --- | --- | --- |
| `food-hunger/food-drive.jpg` | Pexels photo `6590931` | cottonbro studio | https://www.pexels.com/photo/6590931/ |
| `food-hunger/meal-packing.jpg` | Pexels photo `6591154` | cottonbro studio | https://www.pexels.com/photo/6591154/ |

Two other Pexels candidates were downloaded and rejected during this
replacement, for reasons worth recording:

- `9090903` (Lagos Food Bank Initiative) — Pexels-licensed and visually
  strong, but prominently shows a **real organization's branding**. Kynd's
  organizations are synthetic and its Terms state they are unaffiliated with
  real organizations, so using it would have implied an affiliation that does
  not exist.
- `6995215` (Julia M Cameron) — Pexels-licensed, but the subjects wear
  pandemic-era face masks, which reads as dated against the demo's setting.

### Everything else

The remaining 45 source photographs were verified as Pexels-sourced from
their download metadata (`kMDItemWhereFroms` recording `images.pexels.com` /
`pexels.com`).

## Fonts

**DM Sans**, served by [Google Fonts](https://fonts.google.com/specimen/DM+Sans)
under the [SIL Open Font License 1.1](https://openfontlicense.org/). Loaded
remotely from `fonts.googleapis.com` rather than bundled, which is disclosed
on the Privacy page because the visitor's browser contacts Google directly.

## Icons

**[lucide-react](https://lucide.dev)** — ISC License. Bundled with the app.

## Brand

The Kynd wordmark and favicon were created for this project. Kynd is an
independent portfolio demonstration, not a registered trademark, and makes no
® or ™ claim.

## Organizations, people, and listings

Every organization, person, opportunity, activity, and fundraiser in the
seeded world is synthetic and generated for this project. None is affiliated
with, endorsed by, or derived from a real organization; any resemblance to a
real organization's name is unintended.
