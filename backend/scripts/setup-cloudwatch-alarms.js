#!/usr/bin/env node
/**
 * CloudWatch Alarms & Dashboard Setup
 *
 * Creates CloudWatch alarms for the QuotationApp production environment.
 * Run ONCE after launch with your actual instance IDs.
 *
 * Required environment variables (set these after EC2/RDS launch):
 *   EC2_INSTANCE_ID  – e.g. i-0abc123def456789
 *   RDS_INSTANCE_ID  – e.g. quotation-db
 *   SNS_TOPIC_ARN    – e.g. arn:aws:sns:us-east-1:123456789012:quotationapp-alerts
 *   AWS_REGION       – default us-east-1
 *   CW_NAMESPACE     – default Custom/QuotationApp (must match health-check-cloudwatch.js)
 *
 * Usage:
 *   EC2_INSTANCE_ID=i-xxx RDS_INSTANCE_ID=quotation-db SNS_TOPIC_ARN=arn:aws:sns:... node setup-cloudwatch-alarms.js
 */

const EC2_INSTANCE_ID = process.env.EC2_INSTANCE_ID;
const RDS_INSTANCE_ID = process.env.RDS_INSTANCE_ID;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const CW_NAMESPACE = process.env.CW_NAMESPACE || 'Custom/QuotationApp';

if (!EC2_INSTANCE_ID || !RDS_INSTANCE_ID || !SNS_TOPIC_ARN) {
  console.error('ERROR: Required environment variables not set.');
  console.error('  EC2_INSTANCE_ID  =', EC2_INSTANCE_ID || '(missing)');
  console.error('  RDS_INSTANCE_ID  =', RDS_INSTANCE_ID || '(missing)');
  console.error('  SNS_TOPIC_ARN    =', SNS_TOPIC_ARN || '(missing)');
  console.error('\nSet these after your EC2 and RDS instances are launched.');
  process.exit(1);
}

const ALARMS = [
  // App health (from health-check-cloudwatch.js)
  {
    AlarmName: 'QuotationApp-HealthDown',
    AlarmDescription: 'App health check returned degraded/down for 2 consecutive minutes',
    Namespace: CW_NAMESPACE,
    MetricName: 'HealthStatus',
    Dimensions: [{ Name: 'InstanceId', Value: EC2_INSTANCE_ID }],
    Statistic: 'Minimum',
    Period: 60,
    EvaluationPeriods: 2,
    Threshold: 1,
    ComparisonOperator: 'LessThanThreshold',
    TreatMissingData: 'breaching',
  },
  {
    AlarmName: 'QuotationApp-DBLatencyHigh',
    AlarmDescription: 'Database probe latency > 500ms for 3 consecutive minutes',
    Namespace: CW_NAMESPACE,
    MetricName: 'DBLatencyMs',
    Dimensions: [{ Name: 'InstanceId', Value: EC2_INSTANCE_ID }],
    Statistic: 'Average',
    Period: 60,
    EvaluationPeriods: 3,
    Threshold: 500,
    ComparisonOperator: 'GreaterThanThreshold',
    TreatMissingData: 'missing',
  },
  // EC2 instance alarms
  {
    AlarmName: 'QuotationApp-EC2-CPUHigh',
    AlarmDescription: 'EC2 CPU > 80% for 5 consecutive minutes',
    Namespace: 'AWS/EC2',
    MetricName: 'CPUUtilization',
    Dimensions: [{ Name: 'InstanceId', Value: EC2_INSTANCE_ID }],
    Statistic: 'Average',
    Period: 60,
    EvaluationPeriods: 5,
    Threshold: 80,
    ComparisonOperator: 'GreaterThanThreshold',
    TreatMissingData: 'missing',
  },
  {
    AlarmName: 'QuotationApp-EC2-StatusCheckFailed',
    AlarmDescription: 'EC2 status check failed',
    Namespace: 'AWS/EC2',
    MetricName: 'StatusCheckFailed',
    Dimensions: [{ Name: 'InstanceId', Value: EC2_INSTANCE_ID }],
    Statistic: 'Maximum',
    Period: 60,
    EvaluationPeriods: 2,
    Threshold: 0,
    ComparisonOperator: 'GreaterThanThreshold',
    TreatMissingData: 'breaching',
  },
  // RDS alarms
  {
    AlarmName: 'QuotationApp-RDS-CPUHigh',
    AlarmDescription: 'RDS CPU > 80% for 5 consecutive minutes',
    Namespace: 'AWS/RDS',
    MetricName: 'CPUUtilization',
    Dimensions: [{ Name: 'DBInstanceIdentifier', Value: RDS_INSTANCE_ID }],
    Statistic: 'Average',
    Period: 60,
    EvaluationPeriods: 5,
    Threshold: 80,
    ComparisonOperator: 'GreaterThanThreshold',
    TreatMissingData: 'missing',
  },
  {
    AlarmName: 'QuotationApp-RDS-FreeStorageLow',
    AlarmDescription: 'RDS free storage < 2 GB',
    Namespace: 'AWS/RDS',
    MetricName: 'FreeStorageSpace',
    Dimensions: [{ Name: 'DBInstanceIdentifier', Value: RDS_INSTANCE_ID }],
    Statistic: 'Average',
    Period: 300,
    EvaluationPeriods: 1,
    Threshold: 2 * 1024 * 1024 * 1024, // 2 GB in bytes
    ComparisonOperator: 'LessThanThreshold',
    TreatMissingData: 'missing',
  },
  {
    AlarmName: 'QuotationApp-RDS-ConnectionsHigh',
    AlarmDescription: 'RDS connections > 80 for 3 consecutive minutes',
    Namespace: 'AWS/RDS',
    MetricName: 'DatabaseConnections',
    Dimensions: [{ Name: 'DBInstanceIdentifier', Value: RDS_INSTANCE_ID }],
    Statistic: 'Average',
    Period: 60,
    EvaluationPeriods: 3,
    Threshold: 80,
    ComparisonOperator: 'GreaterThanThreshold',
    TreatMissingData: 'missing',
  },
  {
    AlarmName: 'QuotationApp-RDS-ReadLatencyHigh',
    AlarmDescription: 'RDS read latency > 20ms for 5 consecutive minutes',
    Namespace: 'AWS/RDS',
    MetricName: 'ReadLatency',
    Dimensions: [{ Name: 'DBInstanceIdentifier', Value: RDS_INSTANCE_ID }],
    Statistic: 'Average',
    Period: 60,
    EvaluationPeriods: 5,
    Threshold: 0.02, // 20ms in seconds (RDS reports in seconds)
    ComparisonOperator: 'GreaterThanThreshold',
    TreatMissingData: 'missing',
  },
];

(async () => {
  try {
    const { CloudWatchClient, PutMetricAlarmCommand } = require('@aws-sdk/client-cloudwatch');
    const client = new CloudWatchClient({ region: AWS_REGION });

    console.log(`Setting up ${ALARMS.length} CloudWatch alarms...`);
    console.log(`  EC2 Instance: ${EC2_INSTANCE_ID}`);
    console.log(`  RDS Instance: ${RDS_INSTANCE_ID}`);
    console.log(`  SNS Topic:    ${SNS_TOPIC_ARN}`);
    console.log(`  Region:       ${AWS_REGION}`);
    console.log('');

    for (const alarm of ALARMS) {
      try {
        await client.send(new PutMetricAlarmCommand({
          ...alarm,
          AlarmActions: [SNS_TOPIC_ARN],
          OKActions: [SNS_TOPIC_ARN],
          ActionsEnabled: true,
        }));
        console.log(`  OK  ${alarm.AlarmName}`);
      } catch (err) {
        console.error(`  FAIL  ${alarm.AlarmName}: ${err.message}`);
      }
    }

    console.log('\nDone. Verify alarms in the AWS Console:');
    console.log(`  https://${AWS_REGION}.console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#alarmsV2:`);
  } catch (err) {
    console.error('Fatal:', err.message);
    process.exit(1);
  }
})();
