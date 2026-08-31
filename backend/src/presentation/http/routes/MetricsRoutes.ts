import { Router } from "express";
import type { MetricsService } from "../../../infrastructure/metrics/MetricsService";

/**
 * Prometheus metrics endpoint for Prometheus scraping.
 */
export function createMetricsRoutes(metrics?: MetricsService): Router {
  const router = Router();
  router.get("/metrics", async (_req, res) => {
    if (!metrics) {
      res.status(404).json({ error: "Metrics disabled" });
      return;
    }
    res.setHeader("Content-Type", "text/plain");
    res.send(await metrics.metrics());
  });
  return router;
}
