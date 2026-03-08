import express from "express";
import cors from "cors";

import { ClerkExpressRequireAuth, ClerkExpressWithAuth } from "@clerk/express"



const app = express();

app.use(cors());
app.use(express.json());
app.use(ClerkExpressWithAuth())


app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Outly API running smoothhly ",
  });
});


import eventRoutes from "./routes/event.routes.js"

app.use("/api/events", ClerkExpressRequireAuth(), eventRoutes)

app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});



export default app;