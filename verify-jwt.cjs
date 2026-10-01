const { jwtVerify } = require("jose");
require("dotenv").config();

const token = process.argv[2];
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

async function verify() {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    console.log("JWT Valid! Payload:", JSON.stringify(payload, null, 2));
  } catch (e) {
    console.error("JWT Invalid:", e.message);
  }
}
verify();
