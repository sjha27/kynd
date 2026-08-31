const crypto = require('crypto');

const URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c';

function uuidToBytes(uuid) {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function deterministicUuid(namespace, key) {
  const name = `https://kynd.demo/${namespace}/${key}`;

  const hash = crypto
    .createHash('sha1')
    .update(uuidToBytes(URL_NAMESPACE))
    .update(Buffer.from(name, 'utf8'))
    .digest();

  const bytes = Buffer.from(hash.subarray(0, 16));

  // UUID version 5.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;

  // RFC variant.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

module.exports = {
  deterministicUuid,
};
