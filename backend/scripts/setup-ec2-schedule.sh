#!/usr/bin/env bash
# ============================================================================
# setup-ec2-schedule.sh
# Creates AWS EventBridge rules + Lambda functions to auto-start/stop
# EC2 instances on a daily schedule (10am–9pm ET).
#
# Schedule (UTC, conservative EST/UTC-5):
#   Start: 10:00 AM ET → cron(0 15 * * ? *)
#   Stop:   9:00 PM ET → cron(0 2  * * ? *)
#
# During EDT (Mar–Nov) this means 11:00am start / 10:00pm stop — fine as buffer.
#
# Prerequisites:
#   - AWS CLI v2 configured with admin or IAM/Lambda/Events/EC2 permissions
#   - Two EC2 instance IDs set below
#
# Usage:
#   chmod +x backend/scripts/setup-ec2-schedule.sh
#   bash backend/scripts/setup-ec2-schedule.sh
# ============================================================================

set -euo pipefail

# ── CONFIGURATION ──────────────────────────────────────────────────────────
REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# ** REPLACE THESE with your actual EC2 instance IDs **
INSTANCE_IDS="i-XXXXXXXXXXXXXXXXX,i-YYYYYYYYYYYYYYYYY"

ROLE_NAME="ec2-start-stop-scheduler-role"
START_FUNCTION="ec2-scheduled-start"
STOP_FUNCTION="ec2-scheduled-stop"
START_RULE="ec2-daily-start-1000et"
STOP_RULE="ec2-daily-stop-2100et"

echo "Account:      $ACCOUNT_ID"
echo "Region:       $REGION"
echo "Instance IDs: $INSTANCE_IDS"
echo ""

# ── STEP 1: IAM Role ──────────────────────────────────────────────────────
echo "=== Step 1: Creating IAM role ==="

ASSUME_ROLE_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}'

aws iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document "$ASSUME_ROLE_POLICY" \
  --description "Allows Lambda to start/stop EC2 instances on schedule" \
  --region "$REGION" 2>/dev/null \
  && echo "  Created role: $ROLE_NAME" \
  || echo "  Role already exists: $ROLE_NAME"

# Attach minimal EC2 permissions
EC2_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ec2:StartInstances",
      "ec2:StopInstances"
    ],
    "Resource": "arn:aws:ec2:'"$REGION"':'"$ACCOUNT_ID"':instance/*"
  }]
}'

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "ec2-start-stop" \
  --policy-document "$EC2_POLICY" \
  --region "$REGION"
echo "  Attached ec2-start-stop inline policy"

# Attach CloudWatch Logs for Lambda logging
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" \
  --region "$REGION" 2>/dev/null \
  && echo "  Attached AWSLambdaBasicExecutionRole" \
  || echo "  AWSLambdaBasicExecutionRole already attached"

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo "  Role ARN: $ROLE_ARN"

# Wait for IAM propagation
echo "  Waiting 10s for IAM propagation..."
sleep 10

# ── STEP 2: Lambda functions ──────────────────────────────────────────────
echo ""
echo "=== Step 2: Creating Lambda functions ==="

# Create temp directory for Lambda zip
TMPDIR=$(mktemp -d)

# -- Start function --
cat > "$TMPDIR/index.mjs" << 'STARTEOF'
import { EC2Client, StartInstancesCommand } from "@aws-sdk/client-ec2";
const ec2 = new EC2Client();
const ids = process.env.INSTANCE_IDS.split(",");
export const handler = async () => {
  const res = await ec2.send(new StartInstancesCommand({ InstanceIds: ids }));
  console.log("Started:", JSON.stringify(res.StartingInstances));
  return res;
};
STARTEOF

(cd "$TMPDIR" && zip -j start.zip index.mjs > /dev/null)

aws lambda create-function \
  --function-name "$START_FUNCTION" \
  --runtime "nodejs20.x" \
  --role "$ROLE_ARN" \
  --handler "index.handler" \
  --zip-file "fileb://$TMPDIR/start.zip" \
  --timeout 30 \
  --memory-size 128 \
  --environment "Variables={INSTANCE_IDS=$INSTANCE_IDS}" \
  --description "Start EC2 instances at store opening (10:00am ET)" \
  --region "$REGION" \
  --no-cli-pager 2>/dev/null \
  && echo "  Created function: $START_FUNCTION" \
  || {
    echo "  Updating existing function: $START_FUNCTION"
    aws lambda update-function-code \
      --function-name "$START_FUNCTION" \
      --zip-file "fileb://$TMPDIR/start.zip" \
      --region "$REGION" --no-cli-pager > /dev/null
    aws lambda update-function-configuration \
      --function-name "$START_FUNCTION" \
      --environment "Variables={INSTANCE_IDS=$INSTANCE_IDS}" \
      --region "$REGION" --no-cli-pager > /dev/null
  }

# -- Stop function --
cat > "$TMPDIR/index.mjs" << 'STOPEOF'
import { EC2Client, StopInstancesCommand } from "@aws-sdk/client-ec2";
const ec2 = new EC2Client();
const ids = process.env.INSTANCE_IDS.split(",");
export const handler = async () => {
  const res = await ec2.send(new StopInstancesCommand({ InstanceIds: ids }));
  console.log("Stopped:", JSON.stringify(res.StoppingInstances));
  return res;
};
STOPEOF

(cd "$TMPDIR" && zip -j stop.zip index.mjs > /dev/null)

aws lambda create-function \
  --function-name "$STOP_FUNCTION" \
  --runtime "nodejs20.x" \
  --role "$ROLE_ARN" \
  --handler "index.handler" \
  --zip-file "fileb://$TMPDIR/stop.zip" \
  --timeout 30 \
  --memory-size 128 \
  --environment "Variables={INSTANCE_IDS=$INSTANCE_IDS}" \
  --description "Stop EC2 instances at store closing (9:00pm ET)" \
  --region "$REGION" \
  --no-cli-pager 2>/dev/null \
  && echo "  Created function: $STOP_FUNCTION" \
  || {
    echo "  Updating existing function: $STOP_FUNCTION"
    aws lambda update-function-code \
      --function-name "$STOP_FUNCTION" \
      --zip-file "fileb://$TMPDIR/stop.zip" \
      --region "$REGION" --no-cli-pager > /dev/null
    aws lambda update-function-configuration \
      --function-name "$STOP_FUNCTION" \
      --environment "Variables={INSTANCE_IDS=$INSTANCE_IDS}" \
      --region "$REGION" --no-cli-pager > /dev/null
  }

rm -rf "$TMPDIR"

START_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${START_FUNCTION}"
STOP_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${STOP_FUNCTION}"

# ── STEP 3: EventBridge rules ─────────────────────────────────────────────
echo ""
echo "=== Step 3: Creating EventBridge scheduled rules ==="

# Start rule — 10:00 AM ET (15:00 UTC)
aws events put-rule \
  --name "$START_RULE" \
  --schedule-expression "cron(0 15 * * ? *)" \
  --state ENABLED \
  --description "Start EC2 instances at 10:00am ET daily" \
  --region "$REGION" \
  --no-cli-pager > /dev/null
echo "  Created rule: $START_RULE — cron(0 15 * * ? *)"

# Stop rule — 9:00 PM ET (02:00 UTC next day)
aws events put-rule \
  --name "$STOP_RULE" \
  --schedule-expression "cron(0 2 * * ? *)" \
  --state ENABLED \
  --description "Stop EC2 instances at 9:00pm ET daily" \
  --region "$REGION" \
  --no-cli-pager > /dev/null
echo "  Created rule: $STOP_RULE — cron(0 2 * * ? *)"

# ── STEP 4: Connect rules to Lambda targets ───────────────────────────────
echo ""
echo "=== Step 4: Connecting rules to Lambda targets ==="

aws events put-targets \
  --rule "$START_RULE" \
  --targets "Id=start-target,Arn=$START_ARN" \
  --region "$REGION" \
  --no-cli-pager > /dev/null
echo "  $START_RULE → $START_FUNCTION"

aws events put-targets \
  --rule "$STOP_RULE" \
  --targets "Id=stop-target,Arn=$STOP_ARN" \
  --region "$REGION" \
  --no-cli-pager > /dev/null
echo "  $STOP_RULE → $STOP_FUNCTION"

# ── STEP 5: Grant EventBridge permission to invoke Lambda ──────────────────
echo ""
echo "=== Step 5: Adding Lambda invoke permissions ==="

aws lambda add-permission \
  --function-name "$START_FUNCTION" \
  --statement-id "eventbridge-start-invoke" \
  --action "lambda:InvokeFunction" \
  --principal "events.amazonaws.com" \
  --source-arn "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${START_RULE}" \
  --region "$REGION" \
  --no-cli-pager 2>/dev/null \
  && echo "  Granted EventBridge → $START_FUNCTION" \
  || echo "  Permission already exists for $START_FUNCTION"

aws lambda add-permission \
  --function-name "$STOP_FUNCTION" \
  --statement-id "eventbridge-stop-invoke" \
  --action "lambda:InvokeFunction" \
  --principal "events.amazonaws.com" \
  --source-arn "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${STOP_RULE}" \
  --region "$REGION" \
  --no-cli-pager 2>/dev/null \
  && echo "  Granted EventBridge → $STOP_FUNCTION" \
  || echo "  Permission already exists for $STOP_FUNCTION"

# ── DONE ──────────────────────────────────────────────────────────────────
echo ""
echo "============================================================================"
echo "SETUP COMPLETE"
echo "============================================================================"
echo ""
echo "Resources created:"
echo "  IAM Role:    $ROLE_NAME"
echo "  Lambda:      $START_FUNCTION  (start instances)"
echo "  Lambda:      $STOP_FUNCTION   (stop instances)"
echo "  Rule:        $START_RULE      cron(0 15 * * ? *)   = 10:00am ET"
echo "  Rule:        $STOP_RULE      cron(0 2  * * ? *)   = 9:00pm ET"
echo "  Instances:   $INSTANCE_IDS"
echo ""
echo "To test the stop function manually:"
echo "  aws lambda invoke --function-name $STOP_FUNCTION --region $REGION /dev/stdout"
echo ""
echo "To test the start function manually:"
echo "  aws lambda invoke --function-name $START_FUNCTION --region $REGION /dev/stdout"
echo ""
echo "To disable the schedule temporarily:"
echo "  aws events disable-rule --name $START_RULE --region $REGION"
echo "  aws events disable-rule --name $STOP_RULE --region $REGION"
echo ""
echo "IMPORTANT: Update INSTANCE_IDS at the top of this script with your actual"
echo "EC2 instance IDs before running. The placeholder values will NOT work."
echo "============================================================================"
