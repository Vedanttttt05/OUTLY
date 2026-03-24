import dotenv from "dotenv";
dotenv.config();

import { server } from "./app.js";
import pool from "./db/connection.js";

const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  try {
    await pool.query("SELECT 1");
    console.log(`Server running on port ${PORT}`);
  } catch (error) {
    console.error("DB connection failed", error);
    process.exit(1);
  }
});