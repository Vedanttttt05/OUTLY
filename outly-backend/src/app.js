import express from "express";
import cors from "cors";
import morgan from "morgan";
import http from "http";
import { initSocket } from "./socket.js";
import { clerkMiddleware } from "@clerk/express";

import webhookRoutes from "./routes/webhook.routes.js";
import venueRouter from "./routes/venue.routes.js";
import eventRoutes from "./routes/event.routes.js";
import identityVerificationRoutes from "./routes/identityVerification.routes.js";

const app = express();
const server = http.createServer(app);
initSocket(server);

app.use(cors());
app.use(morgan("dev"));
app.use(clerkMiddleware());

app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRoutes);

app.use(express.json({ limit: "12mb" }));
app.use("/api/venues", venueRouter);
app.use("/api/events", eventRoutes);
app.use("/api/identity-verification", identityVerificationRoutes);

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Outly API running smoothly",
  });
});

app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

export { server };
export default app;