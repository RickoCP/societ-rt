require("dotenv").config();

const token = process.argv[2];

// Simulate middleware secret loading
const requireJwtSecret = () => {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET not set");
  if (value.length < 32) throw new Error("JWT_SECRET too weak");
  return value;
};

const { jwtVerify } = require("jose");

async function test() {
  try {
    const secret = new TextEncoder().encode(requireJwtSecret());
    console.log("Secret loaded, length:", process.env.JWT_SECRET.length);
    
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    console.log("JWT Valid!");
    console.log("userId:", payload.userId);
    console.log("tenantId:", payload.tenantId);
    console.log("role:", payload.role);
  } catch (e) {
    console.error("Failed:", e.message);
  }
}
test();
