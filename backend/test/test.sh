#!/usr/bin/env bash
set -euo pipefail

# Quick API smoke test for Meeting Assistant
# Requirements: curl, jq

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required. Install jq first." >&2
  exit 1
fi

BASE_URL=${BASE_URL:-http://localhost:3000}
INVITE_CODE=${INVITE_CODE:-abc-defg-hij}
TITLE=${TITLE:-"產品規劃會議"}

echo "BASE_URL=${BASE_URL}"

request() {
  local method=$1
  local url=$2
  local data=${3:-}
  local allowed=${4:-}

  if [ -n "$data" ]; then
    resp=$(curl -sS -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -d "$data" \
      -w "\n%{http_code}")
  else
    resp=$(curl -sS -X "$method" "$url" -w "\n%{http_code}")
  fi

  status=$(echo "$resp" | tail -n1)
  body=$(echo "$resp" | sed '$d')

  # allow certain status codes without exiting (e.g., 409 for already-exists)
  if [ "$status" -ge 400 ]; then
    allow=false
    if [ -n "$allowed" ]; then
      IFS=',' read -ra codes <<< "$allowed"
      for c in "${codes[@]}"; do
        if [ "$status" -eq "$c" ]; then
          allow=true
          break
        fi
      done
    fi

    if [ "$allow" = false ]; then
      echo "HTTP $status" >&2
      echo "$body" >&2
      exit 1
    fi
  fi

  echo "$body"
}

echo "1) Create user (host)"
HOST_RES=$(request POST "$BASE_URL/api/users/register" '{"name":"張三","email":"user@example.com"}' 409)
HOST_ID=$(echo "$HOST_RES" | jq -er '.id // empty' 2>/dev/null || true)
if [ -z "$HOST_ID" ]; then
  echo "Host already exists, try login"
  HOST_RES=$(request POST "$BASE_URL/api/users/login" '{"email":"user@example.com"}')
  HOST_ID=$(echo "$HOST_RES" | jq -er '.id // empty')
fi
echo "Host ID: $HOST_ID"

echo "2) Create meeting"
MEETING_RES=$(request POST "$BASE_URL/api/meetings" '{"inviteCode":"'"${INVITE_CODE}"'","title":"'"${TITLE}"'","userId":"'"${HOST_ID}"'"}' 409)
MEETING_ID=$(echo "$MEETING_RES" | jq -er '.id // .meetingId // empty' 2>/dev/null || true)
if [ -z "$MEETING_ID" ]; then
  echo "Meeting creation failed" >&2
  echo "$MEETING_RES" >&2
  exit 1
fi
echo "Meeting ID: $MEETING_ID"

echo "3) Create second user (participant)"
USER2_RES=$(request POST "$BASE_URL/api/users/register" '{"name":"李四","email":"user2@example.com"}' 409)
USER2_ID=$(echo "$USER2_RES" | jq -er '.id // empty' 2>/dev/null || true)
if [ -z "$USER2_ID" ]; then
  echo "User2 already exists, try login"
  USER2_RES=$(request POST "$BASE_URL/api/users/login" '{"email":"user2@example.com"}')
  USER2_ID=$(echo "$USER2_RES" | jq -er '.id // empty')
fi
echo "User2 ID: $USER2_ID"

echo "4) Join meeting with inviteCode"
JOIN_RES=$(request POST "$BASE_URL/api/users/${USER2_ID}/join" '{"inviteCode":"'"${INVITE_CODE}"'"}')
echo "$JOIN_RES" | jq '.'

echo "5) Get user2 meetings"
MY_MEETINGS=$(request GET "$BASE_URL/api/users/${USER2_ID}/meetings")
echo "$MY_MEETINGS" | jq '.'

echo "6) Get single meeting"
MEETING_SINGLE=$(request GET "$BASE_URL/api/meetings/${MEETING_ID}")
echo "$MEETING_SINGLE" | jq '.'

echo "7) Add agenda items to meeting"
ADD_AGENDA=$(request PATCH "$BASE_URL/api/meetings/${MEETING_ID}" '{
  "agenda":[
    {"title":"議程項目 1","time":"10:00","owner":"'"${HOST_ID}"'"},
    {"title":"議程項目 2","time":"10:30"},
    {"title":"議程項目 3","time":"11:00","note":"討論重點"}
  ],
  "date":"2025-12-02"
}')
echo "Agenda added:"
echo "$ADD_AGENDA" | jq '.agenda'

echo "9) Get updated meeting to verify changes"
FINAL_MEETING=$(request GET "$BASE_URL/api/meetings/${MEETING_ID}")
echo "Final state:"
echo "$FINAL_MEETING" | jq '{id: .id, title: .title, description: .description, date: .date, agendaCount: (.agenda | length)}'

echo "Done."