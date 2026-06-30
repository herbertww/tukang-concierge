#!/usr/bin/env bash
# Provisions the Tukang Oracle Cloud instance (VM.Standard.A1.Flex, Ubuntu 22.04 ARM).
# Retries on capacity/throttling errors until the instance launches.
set -euo pipefail

REGION="ap-singapore-1"
AD_REGION="$REGION"
DISPLAY_NAME="tukang-server"
SHAPE="VM.Standard.A1.Flex"
OCPUS=2
MEMORY_GB=12
SUBNET_NAME_FILTER="public subnet-tukang-vcn"
SSH_PUBLIC_KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGp/oI40+OUGlZgwG1iTNV52tsengFUKnI+ocZEOlhrU tukang-oracle-deploy"
RETRY_WAIT_SECONDS=90

log() { echo "[$(date '+%H:%M:%S')] $*" >&2; }
die() { log "ERROR: $*"; exit 1; }

command -v oci >/dev/null 2>&1 || die "OCI CLI not found on PATH. Install/configure it first (oci setup config)."
command -v jq  >/dev/null 2>&1 || die "jq not found on PATH. Install jq first."

log "Fetching tenancy OCID..."
# Primary: read directly from OCI CLI config (fastest, no API call)
OCI_CONFIG_FILE="${OCI_CLI_CONFIG_FILE:-$HOME/.oci/config}"
TENANCY_OCID=$(grep -E '^\s*tenancy\s*=' "$OCI_CONFIG_FILE" 2>/dev/null \
  | head -n1 | cut -d= -f2 | tr -d ' \r' || true)
# Fallback: derive from root compartment list (tenancy is its own parent)
if [[ -z "${TENANCY_OCID:-}" || "$TENANCY_OCID" == "null" ]]; then
  TENANCY_OCID=$(oci iam compartment list \
    --compartment-id-in-subtree false \
    --access-level ACCESSIBLE \
    --query "data[0].\"compartment-id\"" --raw-output 2>/dev/null || true)
fi
[[ -n "${TENANCY_OCID:-}" && "$TENANCY_OCID" != "null" ]] || die "Could not determine tenancy OCID. Check 'oci setup config' / profile."
log "Tenancy OCID: $TENANCY_OCID"

log "Fetching availability domain for $AD_REGION..."
AD_NAME=$(oci iam availability-domain list \
  --compartment-id "$TENANCY_OCID" \
  --query "data[0].name" --raw-output)
[[ -n "$AD_NAME" && "$AD_NAME" != "null" ]] || die "Could not fetch availability domain."
log "Availability domain: $AD_NAME"

log "Fetching latest Ubuntu 22.04 ARM image for $SHAPE..."
IMAGE_OCID=$(oci compute image list \
  --compartment-id "$TENANCY_OCID" \
  --operating-system "Canonical Ubuntu" \
  --operating-system-version "22.04" \
  --shape "$SHAPE" \
  --sort-by TIMECREATED --sort-order DESC \
  --query "data[0].id" --raw-output)
[[ -n "$IMAGE_OCID" && "$IMAGE_OCID" != "null" ]] || die "Could not find an Ubuntu 22.04 ARM image for $SHAPE."
log "Image OCID: $IMAGE_OCID"

log "Fetching subnet OCID matching '$SUBNET_NAME_FILTER'..."
SUBNET_OCID=$(oci network subnet list \
  --compartment-id "$TENANCY_OCID" \
  --all \
  --query "data[?contains(to_string(\"display-name\"), '${SUBNET_NAME_FILTER}')].id | [0]" \
  --raw-output)
if [[ -z "$SUBNET_OCID" || "$SUBNET_OCID" == "null" ]]; then
  # Fallback: case-insensitive scan via jq, in case the subnet lives in a different compartment.
  SUBNET_OCID=$(oci network subnet list --compartment-id "$TENANCY_OCID" --all 2>/dev/null \
    | jq -r --arg f "$SUBNET_NAME_FILTER" '.data[] | select((."display-name"|ascii_downcase) | contains($f|ascii_downcase)) | .id' \
    | head -n1)
fi
[[ -n "$SUBNET_OCID" && "$SUBNET_OCID" != "null" ]] || die "Could not find subnet matching '$SUBNET_NAME_FILTER'."
log "Subnet OCID: $SUBNET_OCID"

SSH_KEY_TMPFILE=$(mktemp)
trap 'rm -f "$SSH_KEY_TMPFILE"' EXIT
printf '%s\n' "$SSH_PUBLIC_KEY" > "$SSH_KEY_TMPFILE"

launch_instance() {
  oci compute instance launch \
    --availability-domain "$AD_NAME" \
    --compartment-id "$TENANCY_OCID" \
    --shape "$SHAPE" \
    --shape-config "{\"ocpus\": ${OCPUS}, \"memoryInGBs\": ${MEMORY_GB}}" \
    --display-name "$DISPLAY_NAME" \
    --image-id "$IMAGE_OCID" \
    --subnet-id "$SUBNET_OCID" \
    --assign-public-ip true \
    --is-pv-encryption-in-transit-enabled true \
    --ssh-authorized-keys-file "$SSH_KEY_TMPFILE" \
    --wait-for-state RUNNING \
    --max-wait-seconds 600
}

ATTEMPT=0
while true; do
  ATTEMPT=$((ATTEMPT + 1))
  log "Launch attempt #$ATTEMPT..."

  set +e
  LAUNCH_OUTPUT=$(launch_instance 2>&1)
  LAUNCH_STATUS=$?
  set -e

  if [[ $LAUNCH_STATUS -eq 0 ]]; then
    INSTANCE_OCID=$(echo "$LAUNCH_OUTPUT" | jq -r '.data.id')
    [[ -n "$INSTANCE_OCID" && "$INSTANCE_OCID" != "null" ]] || die "Launch reported success but no instance OCID was returned."
    log "Instance launched: $INSTANCE_OCID"
    break
  fi

  if echo "$LAUNCH_OUTPUT" | grep -qiE "Out of capacity|OutOfCapacity|TooManyRequests|Out of host capacity|connection to endpoint timed out|RequestException"; then
    log "Capacity/throttling error on attempt #$ATTEMPT. Retrying in ${RETRY_WAIT_SECONDS}s..."
    log "(detail: $(echo "$LAUNCH_OUTPUT" | tr '\n' ' ' | head -c 300))"
    sleep "$RETRY_WAIT_SECONDS"
    continue
  fi

  die "Launch failed with an unrecoverable error:
$LAUNCH_OUTPUT"
done

log "Fetching public IP..."
VNIC_ID=$(oci compute instance list-vnics \
  --instance-id "$INSTANCE_OCID" \
  --query "data[0].id" --raw-output)
PUBLIC_IP=$(oci network vnic get \
  --vnic-id "$VNIC_ID" \
  --query "data.\"public-ip\"" --raw-output)

echo ""
echo "✅ Instance ready"
echo "Instance OCID: $INSTANCE_OCID"
echo "Public IP:     $PUBLIC_IP"
exit 0
