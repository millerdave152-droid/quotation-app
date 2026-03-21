#!/usr/bin/env node
/**
 * CloudWatch Health-Check Publisher
 *
 * Hits GET /health every INTERVAL seconds, then publishes custom metrics:
 *   - Custom/QuotationApp/HealthStatus  (1 = OK, 0 = degraded/down)
 *   - Custom/QuotationApp/DBLatencyMs   (database probe round-trip)
 *
 * Run as a cron job or systemd timer:
 *   * * * * * /usr/bin/node /opt/app/backend/scripts/health-check-cloudwatch.js
 *
 * Environment variables:
 *   HEALTH_URL            – default http://localhost:3001/health
 *   CW_NAMESPACE          – default Custom/QuotationApp
 *   AWS_REGION            – default us-east-1
 *   CW_INSTANCE_ID        – EC2 instance ID (e.g. i-0abc123def456). Set after launch.
 *   HEALTH_CHECK_INTERVAL – seconds between polls when running in loop mode (0 = one-shot, default)
 */

const HEALTH_URL = process.env.HEALTH_URL || 'http://localhost:3001/health';
const CW_NAMESPACE = process.env.CW_NAMESPACE || 'Custom/QuotationApp';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const INSTANCE_ID = process.env.CW_INSTANCE_ID || null;
const INTERVAL = parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 0;

let cwClient;

async function getCloudWatchClient() {
  if (cwClient) return cwClient;
  try {
    const { CloudWatchClient } = require('@aws-sdk/client-cloudwatch');
    cwClient = new CloudWatchClient({ region: AWS_REGION });
    return cwClient;
  } catch {
    // AWS SDK not installed — log metrics to stdout instead
    return null;
  }
}

async function publishMetrics(healthStatus, dbLatencyMs) {
  const timestamp = new Date();
  const dimensions = INSTANCE_ID
    ? [{ Name: 'InstanceId', Value: INSTANCE_ID }]
    : [];

  const metricData = [
    { MetricName: 'HealthStatus', Value: healthStatus, Unit: 'None', Timestamp: timestamp, Dimensions: dimensions },
    ...(dbLatencyMs != null ? [{ MetricName: 'DBLatencyMs', Value: dbLatencyMs, Unit: 'Milliseconds', Timestamp: timestamp, Dimensions: dimensions }] : []),
  ];

  const client = await getCloudWatchClient();
  if (client) {
    try {
      const { PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
      await client.send(new PutMetricDataCommand({
        Namespace: CW_NAMESPACE,
        MetricData: metricData,
      }));
      console.log(`[health-check] Published to CloudWatch: HealthStatus=${healthStatus}, DBLatencyMs=${dbLatencyMs ?? 'N/A'}`);
    } catch (err) {
      console.error('[health-check] CloudWatch publish failed:', err.message);
      // Fall through to stdout logging
      console.log(JSON.stringify({ namespace: CW_NAMESPACE, metrics: metricData }));
    }
  } else {
    // No AWS SDK — log to stdout (useful for dev / non-AWS environments)
    console.log(JSON.stringify({ namespace: CW_NAMESPACE, metrics: metricData }));
  }
}

async function check() {
  let healthStatus = 0;
  let dbLatencyMs = null;

  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(10000) });
    const body = await res.json();

    healthStatus = body.status === 'OK' ? 1 : 0;
    dbLatencyMs = body.checks?.database?.responseTime ?? null;

    console.log(`[health-check] status=${body.status}, dbLatency=${dbLatencyMs}ms, uptime=${Math.round(body.uptime)}s, version=${body.version}, commit=${body.commitHash}`);
  } catch (err) {
    console.error(`[health-check] FAILED to reach ${HEALTH_URL}:`, err.message);
  }

  await publishMetrics(healthStatus, dbLatencyMs);
}

// One-shot (cron) or loop mode
(async () => {
  await check();
  if (INTERVAL > 0) {
    setInterval(check, INTERVAL * 1000);
  }
})();
