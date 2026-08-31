import { Counter, Gauge, Histogram, Registry } from "prom-client";
import type { Logger } from "../../application/ports/Logger";

/**
 * Prometheus metrics collection for the signaling server.
 */
export class MetricsService {
  private readonly registry = new Registry();
  private readonly nodeName: string;

  private readonly wsConnections: Gauge<string>;
  private readonly wsMessages: Counter<string>;
  private readonly wsErrors: Counter<string>;
  private readonly activeRooms: Gauge<string>;
  private readonly activePeers: Gauge<string>;
  private readonly messageLatency: Histogram<string>;
  private readonly signalingMessages: Counter<string>;
  private readonly rateLimited: Counter<string>;
  private readonly reconnectCount: Counter<string>;

  constructor(deps: { nodeName: string; logger: Logger }) {
    this.nodeName = deps.nodeName;

    this.wsConnections = new Gauge({
      name: "videoconff_ws_connections",
      help: "Current number of open WebSocket connections",
      labelNames: ["node"],
    });
    this.wsMessages = new Counter({
      name: "videoconff_ws_messages_total",
      help: "Total WebSocket messages received by type",
      labelNames: ["node", "type"],
    });
    this.wsErrors = new Counter({
      name: "videoconff_ws_errors_total",
      help: "Total WebSocket errors",
      labelNames: ["node", "kind"],
    });
    this.activeRooms = new Gauge({
      name: "videoconff_active_rooms",
      help: "Current number of active rooms",
      labelNames: ["node"],
    });
    this.activePeers = new Gauge({
      name: "videoconff_active_peers",
      help: "Current number of connected peers",
      labelNames: ["node"],
    });
    this.messageLatency = new Histogram({
      name: "videoconff_message_latency_seconds",
      help: "Histogram of message handling latency in seconds",
      labelNames: ["node", "type"],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    });
    this.signalingMessages = new Counter({
      name: "videoconff_signaling_messages_total",
      help: "Total signaling messages relayed",
      labelNames: ["node", "kind"],
    });
    this.rateLimited = new Counter({
      name: "videoconff_rate_limited_total",
      help: "Total requests rejected by rate limiting",
      labelNames: ["node", "scope"],
    });
    this.reconnectCount = new Counter({
      name: "videoconff_reconnects_total",
      help: "Total peer reconnections",
      labelNames: ["node"],
    });

    this.registry.registerMetric(this.wsConnections);
    this.registry.registerMetric(this.wsMessages);
    this.registry.registerMetric(this.wsErrors);
    this.registry.registerMetric(this.activeRooms);
    this.registry.registerMetric(this.activePeers);
    this.registry.registerMetric(this.messageLatency);
    this.registry.registerMetric(this.signalingMessages);
    this.registry.registerMetric(this.rateLimited);
    this.registry.registerMetric(this.reconnectCount);
  }

  setWsConnections(count: number): void {
    this.wsConnections.set({ node: this.nodeName }, count);
  }

  incrementWsMessages(type: string): void {
    this.wsMessages.inc({ node: this.nodeName, type });
  }

  incrementWsErrors(kind: string): void {
    this.wsErrors.inc({ node: this.nodeName, kind });
  }

  setActiveRooms(count: number): void {
    this.activeRooms.set({ node: this.nodeName }, count);
  }

  setActivePeers(count: number): void {
    this.activePeers.set({ node: this.nodeName }, count);
  }

  observeMessageLatency(type: string, durationMs: number): void {
    this.messageLatency.observe({ node: this.nodeName, type }, durationMs / 1000);
  }

  incrementSignaling(kind: string): void {
    this.signalingMessages.inc({ node: this.nodeName, kind });
  }

  incrementRateLimited(scope: string): void {
    this.rateLimited.inc({ node: this.nodeName, scope });
  }

  incrementReconnects(): void {
    this.reconnectCount.inc({ node: this.nodeName });
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
