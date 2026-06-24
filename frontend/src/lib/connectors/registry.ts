// Connector registry + source identification (Part D3/D4).
// Add a new source by registering its connector here — the ingestion
// pipeline (upload route, email webhook) stays untouched.

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BaseConnector, SourceSignals } from "./base-connector";
import { GoKwikConnector } from "./gokwik-connector";
import { CCAvenueConnector } from "./ccavenue-connector";

// Heterogeneous registry: each connector binds its own record type, so the
// element type is intentionally erased to BaseConnector<any>.
type AnyConnector = BaseConnector<any>;

const CONNECTORS: AnyConnector[] = [
  new GoKwikConnector(),
  new CCAvenueConnector(),
  // Future: new RazorpayConnector(), new ShiprocketConnector(), new BankConnector(),
];

export function getConnector(source: string): AnyConnector | null {
  return CONNECTORS.find((c) => c.source === source) ?? null;
}

export function listConnectors(): { source: string; displayName: string }[] {
  return CONNECTORS.map((c) => ({ source: c.source, displayName: c.displayName }));
}

// Identify the most likely source from email/file signals. Returns the
// best match above a confidence threshold, else null (→ manual review).
export function identifySource(
  signals: SourceSignals,
): { connector: AnyConnector; confidence: number } | null {
  let best: { connector: AnyConnector; confidence: number } | null = null;
  for (const c of CONNECTORS) {
    const confidence = c.matches(signals);
    if (confidence > 0 && (!best || confidence > best.confidence)) {
      best = { connector: c, confidence };
    }
  }
  return best && best.confidence >= 0.5 ? best : null;
}
