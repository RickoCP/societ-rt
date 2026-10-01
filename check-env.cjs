require("dotenv").config();
const secret = process.env.JWT_SECRET;
console.log("JWT_SECRET length:", secret ? secret.length : 0);
console.log("First 10 chars:", secret ? secret.substring(0, 10) : "N/A");
