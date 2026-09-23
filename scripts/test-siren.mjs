// Uji nyalakan/matikan sirine lewat Tuya Cloud command API.
// Usage: node scripts/test-siren.mjs <deviceId> [dpCode] [onSeconds]
import 'dotenv/config';
import crypto from 'node:crypto';

const HOST = process.env.TUYA_API_HOST ?? 'https://openapi-sg.iotbing.com';
const CLIENT_ID = process.env.TUYA_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET ?? '';

const deviceId = process.argv[2] ?? 'a38950d3d819b7d448gimn';
const dpCode = process.argv[3] ?? process.env.ALARM_SIREN_DP_CODE ?? 'AlarmSwitch';
const onSeconds = Number(process.argv[4] ?? 5);

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function sign(method, path, t, accessToken, bodyStr) {
  const bodyHash = sha256(bodyStr ?? '');
  const stringToSign = `${method}\n${bodyHash}\n\n${path}`;
  const str = CLIENT_ID + (accessToken ?? '') + t + stringToSign;
  return crypto.createHmac('sha256', CLIENT_SECRET).update(str).digest('hex').toUpperCase();
}

async function tuya(method, path, accessToken, body) {
  const t = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const headers = {
    client_id: CLIENT_ID,
    sign_method: 'HMAC-SHA256',
    t,
    sign: sign(method, path, t, accessToken, bodyStr),
  };
  if (accessToken) headers.access_token = accessToken;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${HOST}${path}`, {
    method,
    headers,
    body: body ? bodyStr : undefined,
  });
  return res.json();
}

async function sendSwitch(token, value) {
  // Coba 3 cara berbeda; tampilkan hasil masing-masing.
  const v1 = await tuya(
    'POST',
    `/v1.0/iot-03/devices/${deviceId}/commands`,
    token,
    { commands: [{ code: dpCode, value }] },
  );
  console.log(`[v1.0 commands] ${dpCode}=${value}:`, JSON.stringify(v1));

  const v1old = await tuya(
    'POST',
    `/v1.0/devices/${deviceId}/commands`,
    token,
    { commands: [{ code: dpCode, value }] },
  );
  console.log(`[v1.0 devices/commands] ${dpCode}=${value}:`, JSON.stringify(v1old));

  const v2 = await tuya(
    'POST',
    `/v2.0/cloud/thing/${deviceId}/shadow/properties/issue`,
    token,
    { properties: JSON.stringify({ [dpCode]: value }) },
  );
  console.log(`[v2.0 properties/issue] ${dpCode}=${value}:`, JSON.stringify(v2));

  return v1;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  const tokenRes = await tuya('GET', '/v1.0/token?grant_type=1', '');
  if (!tokenRes.success) {
    console.log('TOKEN_ERR:', JSON.stringify(tokenRes));
    process.exit(1);
  }
  const token = tokenRes.result.access_token;
  console.log(`Device: ${deviceId} | DP: ${dpCode} | on ${onSeconds}s`);

  await sendSwitch(token, true);
  console.log(`Sirine ON — tunggu ${onSeconds} detik...`);
  await sleep(onSeconds * 1000);
  await sendSwitch(token, false);
  console.log('Sirine OFF. Selesai.');
} catch (e) {
  console.log('ERR:', e.message);
}
