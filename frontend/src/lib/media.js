/*
 * Deterministic media resolution.
 *
 * The rule that matters: a given Kynd object must always resolve to the
 * same photograph, everywhere it appears, on every render. Nothing here may
 * use Math.random() or anything derived from render order.
 *
 * Resolution order for an opportunity:
 *   1. an explicit canonical mapping (flagship / anchor objects)
 *   2. the API's own imageUrl, when we actually ship that file
 *   3. a deterministic pick from the cause's local photo pool, keyed by a
 *      stable hash of the opportunity id
 *   4. null, which lets <Photo> render its neutral panel
 *
 * Step 2 is currently inert: the seed data points at 71 filenames under
 * /demo-assets/opportunities/<cause>/ that were never produced, so trying
 * them would just yield 404s on every card. The check is kept because the
 * moment those files exist the API's own mapping should win.
 */

const BASE = '/demo-assets/opportunities';

// Pools are semantic. A pool is only listed against a cause whose work the
// photographs honestly depict.
const CAUSE_POOLS = {
  Environment: [
    'environment/park-cleanup',
    'environment/litter-collection',
    'environment/street-cleanup',
    'environment/shoreline-cleanup',
    'environment/community-cleanup',
    'environment/tree-planting',
    'environment/garden-care',
  ],
  'Food & Hunger': [
    'food-hunger/food-drive',
    'food-hunger/meal-packing',
    'food-hunger/donation-sorting',
    'food-hunger/pantry-stocking',
    'food-hunger/supply-collection',
  ],
  Animals: [
    'animals/shelter-care',
    'animals/dog-walking',
    'animals/animal-fostering',
    'animals/adoption-support',
    'animals/kennel-support',
  ],
  Education: [
    'education/reading-support',
    'education/tutoring',
    'education/literacy-program',
    'education/classroom-help',
  ],
  Youth: [
    'youth/toy-drive',
    'youth/gift-sorting',
    'youth/youth-program',
    'youth/mentoring',
  ],
  Veterans: [
    'veterans/veteran-support',
    'veterans/care-packages',
    'veterans/veteran-outreach',
    'veterans/service-support',
    'veterans/veteran-services',
    'veterans/community-support',
  ],
  'Disaster Relief': [
    'disaster-relief/supply-sorting',
    'disaster-relief/relief-distribution',
    'disaster-relief/emergency-response',
    'disaster-relief/relief-staging',
  ],

  // Health, Housing and Community have no dedicated photography in the
  // supplied set, so they share the generic volunteering pool rather than
  // borrowing a shelter or cleanup photo that would misrepresent the work.
  // Owner action: these three causes need their own images.
  Health: ['general/community-volunteering', 'general/group-volunteering'],
  Housing: ['general/group-volunteering', 'general/community-volunteering'],
  Community: ['general/community-volunteering', 'general/group-volunteering'],
};

// Objects important enough to pin to one specific photograph forever.
const CANONICAL = {
  // Flagship: Piedmont Park Community Cleanup.
  'bc09559d-77de-5bde-b248-00a1480d6d94': 'environment/park-cleanup',
};

// Every file this build actually ships, so resolution never points at a
// path that would 404.
const SHIPPED = new Set(Object.values(CAUSE_POOLS).flat());

/*
 * FNV-1a over the object id. Chosen because it is stable across runs and
 * platforms — unlike anything based on insertion order or time — so a card
 * and the detail page it opens always agree on the photo.
 */
function hashId(id) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function assetPath(name) {
  return `${BASE}/${name}.jpg`;
}

export function opportunityImage(opportunity) {
  if (!opportunity) return null;

  const canonical = CANONICAL[opportunity.id];
  if (canonical) return assetPath(canonical);

  // Honour the API's own reference if we ship that exact asset.
  const fromApi = opportunity.imageUrl;
  if (fromApi && fromApi.startsWith(`${BASE}/`)) {
    const name = fromApi.slice(BASE.length + 1).replace(/\.[a-z]+$/i, '');
    if (SHIPPED.has(name)) return assetPath(name);
  }

  const pool = CAUSE_POOLS[opportunity.cause?.name];
  if (!pool || pool.length === 0) return null;

  return assetPath(pool[hashId(opportunity.id) % pool.length]);
}

/*
 * Fundraisers resolve through the same cause pools and the same stable id
 * hash as opportunities: the photography honestly depicts work in that cause
 * area, and a fundraiser always shows the same image on its card and its
 * detail page. Falls through to <Photo>'s neutral panel for a cause with no
 * pool, rather than borrowing an unrelated photograph.
 */
export function fundraiserImage(fundraiser) {
  if (!fundraiser) return null;

  const pool = CAUSE_POOLS[fundraiser.cause?.name];
  if (!pool || pool.length === 0) return null;

  return assetPath(pool[hashId(fundraiser.id) % pool.length]);
}

/*
 * Organization logos and user avatars are deliberately NOT resolved to
 * files. The seed data references 25 .svg logos and 50 .webp avatars that
 * do not exist, and the ten supplied portrait photos carry no information
 * about which synthetic person they depict — guessing would attach a real
 * face to an arbitrary name. Both fall through to the deterministic
 * monogram fallbacks instead. See the checkpoint report for the mapping
 * the owner would need to supply.
 */
export function avatarImage() {
  return null;
}

export function organizationImage() {
  return null;
}
