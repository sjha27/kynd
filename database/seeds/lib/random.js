function createRng(seed) {
  let state = seed >>> 0;

  return function rng() {
    state += 0x6D2B79F5;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick(rng, values) {
  if (!values.length) {
    throw new Error('Cannot pick from an empty array.');
  }

  return values[randomInt(rng, 0, values.length - 1)];
}

function chance(rng, probability) {
  return rng() < probability;
}

function weightedPick(rng, options) {
  const totalWeight = options.reduce(
    (sum, option) => sum + option.weight,
    0
  );

  let cursor = rng() * totalWeight;

  for (const option of options) {
    cursor -= option.weight;

    if (cursor <= 0) {
      return option;
    }
  }

  return options[options.length - 1];
}

module.exports = {
  createRng,
  randomInt,
  pick,
  chance,
  weightedPick,
};
