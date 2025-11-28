import mysql from "mysql2/promise";
import dotenvConfig from "./dotenvConfig.js";

export const db = await mysql.createConnection({
  host: dotenvConfig.DB_HOST,
  user: dotenvConfig.DB_USER,
  password: dotenvConfig.DB_PASSWORD,
  port: dotenvConfig.DB_PORT,
  database: dotenvConfig.DB_NAME,
});

console.log("✅ Connected to MySQL");
