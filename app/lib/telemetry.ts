type TelemetryPayload = {
  event: string;
  ts?: string;
  source?: "client" | "server";
  [key: string]: unknown;
};

function normalize(payload: TelemetryPayload, source: "client" | "server"): TelemetryPayload {
  return {
    ...payload,
    source,
    ts: payload.ts ?? new Date().toISOString(),
  };
}

export function logServerTelemetry(payload: TelemetryPayload) {
  const event = normalize(payload, "server");
  console.info("[telemetry]", JSON.stringify(event));
}

export async function trackClientTelemetry(payload: TelemetryPayload) {
  const event = normalize(payload, "client");

  // Keep a local trace for easy demo debugging.
  console.info("[telemetry]", event);

  try {
    await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
      cache: "no-store",
    });
  } catch {
    // Never block UX on instrumentation.
  }
}
