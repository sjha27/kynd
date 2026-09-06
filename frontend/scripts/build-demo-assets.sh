#!/usr/bin/env bash
#
# Builds shippable demo media from the source photography in
# "Photos for Kynd/" at the repo root.
#
# All sources are third-party stock from Pexels, used under the Pexels
# License. See ASSETS.md at the repo root for provenance.
#
# The source files are 3840x2160 to 4984x6229 and total ~81MB, which is far
# too heavy to serve. This crops each one to Kynd's 16:9 card/hero ratio at
# 1200x675 and re-encodes at JPEG q70, taking the shipped set to a few MB.
#
# Output: frontend/public/demo-assets/opportunities/<pool>/<name>.jpg
#
# Pools are semantic, not decorative — each maps to the causes whose
# opportunities that imagery honestly depicts. See frontend/src/lib/media.js
# for how an opportunity resolves to a pool.
#
# Idempotent: re-running overwrites the generated files. Source photos are
# never modified. Requires macOS `sips` (no new npm dependency).
#
# Usage:  bash frontend/scripts/build-demo-assets.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$REPO_ROOT/Photos for Kynd"
OUT="$REPO_ROOT/frontend/public/demo-assets/opportunities"

WIDTH=1200
HEIGHT=675
QUALITY=70

if [ ! -d "$SRC" ]; then
  echo "Source photo directory not found: $SRC" >&2
  exit 1
fi

# "<source basename>|<pool>/<output name>"
MAPPINGS=(
  "Kynd - Trash Clean Up 1|environment/park-cleanup"
  "Kynd - Trash Clean Up 2|environment/litter-collection"
  "Kynd - Trash Clean Up 3|environment/street-cleanup"
  "Kynd - Trash Clean Up 4|environment/shoreline-cleanup"
  "Kynd - Trash Clean Up 5|environment/community-cleanup"
  "Kynd - Volunteering Environment 1|environment/tree-planting"
  "Kynd - Volunteering Environment 2|environment/garden-care"

  "Kynd - Food Drive (Pexels 6590931)|food-hunger/food-drive"
  "Kynd - Meal Packing (Pexels 6591154)|food-hunger/meal-packing"
  "Kynd - Donation 1|food-hunger/donation-sorting"
  "Kynd - Donation 2|food-hunger/pantry-stocking"
  "Kynd - Donation 3|food-hunger/supply-collection"

  "Kynd - Helping Pets 1|animals/shelter-care"
  "Kynd - Helping Pets 2|animals/dog-walking"
  "Kynd - Helping Pets 3|animals/animal-fostering"
  "Kynd - Helping Pets 4|animals/adoption-support"
  "Kynd - Helping Pets 5|animals/kennel-support"

  "Kynd - Help Kids Read 1|education/reading-support"
  "Kynd - Help Kids Read 2|education/tutoring"
  "Kynd - Help Kids Read 3|education/literacy-program"
  "Kynd - Help Kids Read 4|education/classroom-help"

  "Kynd - Toy Drive 1|youth/toy-drive"
  "Kynd - Toy Drive 2|youth/gift-sorting"
  "Kynd - Toy Drive 3|youth/youth-program"
  "Kynd - Toy Drive 4|youth/mentoring"

  "Kynd - Helping Veterans 1|veterans/veteran-support"
  "Kynd - Helping Veterans 2|veterans/care-packages"
  "Kynd - Helping Veterans 3|veterans/veteran-outreach"
  "Kynd - Helping Veterans 4|veterans/service-support"
  "Kynd - Helping Veterans 5|veterans/veteran-services"
  "Kynd - Helping Veterans 6|veterans/community-support"

  "Kynd - Disaster Relief 1|disaster-relief/supply-sorting"
  "Kynd - Disaster Relief 2|disaster-relief/relief-distribution"
  "Kynd - Disaster Relief 3|disaster-relief/emergency-response"
  "Kynd - Disaster Relief 4|disaster-relief/relief-staging"

  "Kynd - Volunteering 1|general/community-volunteering"
  "Kynd - Volunteering 2|general/group-volunteering"
)

built=0
missing=0

for entry in "${MAPPINGS[@]}"; do
  base="${entry%%|*}"
  target="${entry##*|}"
  src="$SRC/$base.jpg"

  if [ ! -f "$src" ]; then
    echo "  MISSING SOURCE: $base.jpg" >&2
    missing=$((missing + 1))
    continue
  fi

  dest="$OUT/$target.jpg"
  mkdir -p "$(dirname "$dest")"

  # Two passes: scale to the target width preserving aspect, then take a
  # centred crop to the exact 16:9 box. Every source is at least 0.5625
  # tall relative to its width, so the crop never pads.
  sips --resampleWidth "$WIDTH" "$src" --out "$dest" >/dev/null 2>&1
  sips -c "$HEIGHT" "$WIDTH" "$dest" >/dev/null 2>&1
  sips -s format jpeg -s formatOptions "$QUALITY" "$dest" >/dev/null 2>&1

  built=$((built + 1))
done

echo "Built $built images into frontend/public/demo-assets/opportunities/"
[ "$missing" -gt 0 ] && echo "$missing source file(s) missing — see above." >&2
du -sh "$OUT"
