import express from "express";
import cors from "cors";
import morgan from "morgan"


import { clerkMiddleware, requireAuth } from "@clerk/express"

import webhookRoutes from "./routes/webhook.routes.js"




const app = express();

app.use(cors());
app.use(express.json());
app.use(clerkMiddleware())
app.use(morgan("dev"))


app.use("/api/webhooks", webhookRoutes)

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Outly API running smoothhly ",
  });
});


import eventRoutes from "./routes/event.routes.js"

app.use("/api/events",  eventRoutes)

app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});



export default app;