import dotenv from "dotenv";
import app from "./app.js";
import pool from "./db/connection.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  try {
    await pool.query("SELECT 1");
    console.log(`Server running on port ${PORT}`);
  } catch (error) {
    console.error("DB connection failed", error);
  }
});