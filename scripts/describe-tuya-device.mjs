// Menampilkan daftar DP code (functions/status) sebuah device dari Tuya Cloud.
// Usage: node scripts/describe-tuya-device.mjs <deviceId>
import 'dotenv/config';
import crypto from 'node:crypto';

const HOST = process.env.TUYA_API_HOST ?? 'https://openapi-sg.iotbing.com';
const CLIENT_ID = process.env.TUYA_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET ?? '';
const deviceId = process.argv[2];

if (!deviceId) {
  console.log('ERR: berikan deviceId. Contoh: node scripts/describe-tuya-device.mjs a38950d3d819b7d448gimn');
  process.exit(1);
}
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.log('ERR: TUYA_CLIENT_ID / TUYA_CLIENT_SECRET kosong di .env');
  process.exit(1);
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
const EMPTY_BODY_HASH = sha256('');

// Tuya signature (business API). For token request accessToken kosong.
function sign(method, path, t, accessToken = '') {
  const stringToSign = `${method}\n${EMPTY_BODY_HASH}\n\n${path}`;
  const str = CLIENT_ID + accessToken + t + stringToSign;
  return crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(str)
    .digest('hex')
    .toUpperCase();
}

async function tuyaGet(path, accessToken) {
  const t = Date.now().toString();
  const headers = {
    client_id: CLIENT_ID,
    sign_method: 'HMAC-SHA256',
    t,
    sign: sign('GET', path, t, accessToken),
  };
  if (accessToken) headers.access_token = accessToken;
  const res = await fetch(`${HOST}${path}`, { method: 'GET', headers });
  return res.json();
}

try {
  // 1. token
  const tokenRes = await tuyaGet('/v1.0/token?grant_type=1', '');
  if (!tokenRes.success) {
    console.log('TOKEN_ERR:', JSON.stringify(tokenRes));
    process.exit(1);
  }
  const token = tokenRes.result.access_token;

  // Coba beberapa varian endpoint (berbeda per data center / versi).
  const endpoints = [
    `/v1.0/devices/${deviceId}/specifications`,
    `/v1.1/devices/${deviceId}/specifications`,
    `/v2.0/cloud/thing/${deviceId}/model`,
    `/v2.0/cloud/thing/${deviceId}/shadow/properties`,
    `/v1.0/iot-03/devices/${deviceId}/specification`,
    `/v1.0/iot-03/devices/${deviceId}/status`,
    `/v1.0/devices/${deviceId}`,
    `/v1.0/devices/${deviceId}/functions`,
  ];
  for (const ep of endpoints) {
    const r = await tuyaGet(ep, token);
    console.log(`\n=== ${ep} ===`);
    console.log(JSON.stringify(r, null, 2));
  }
} catch (e) {
  console.log('ERR:', e.message);
}
