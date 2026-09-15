#!/usr/bin/env bash
# Smoke test thu cong cho backend Digital_Work.
# Chay: bash test/smoke.sh (sau khi server dang chay tren PORT trong .env, mac dinh 3000)
# Yeu cau: da chay migrations 001-006, da tao it nhat 1 admin qua pgAdmin
# (vi /api/auth/register luon tao role 'user', xem migrations/999_smoke_test.sql).

set -e
BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@12345}"

echo "== 1. Login as admin =="
LOGIN_RES=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
echo "$LOGIN_RES"
ADMIN_TOKEN=$(echo "$LOGIN_RES" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "== 2. Admin creates a manager and a user =="
MANAGER_RES=$(curl -s -X POST "$BASE_URL/api/users" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"Manager Test","email":"manager.test@example.com","password":"Manager@123","role":"manager"}')
echo "$MANAGER_RES"
MANAGER_ID=$(echo "$MANAGER_RES" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')

USER_RES=$(curl -s -X POST "$BASE_URL/api/users" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"Worker Test","email":"worker.test@example.com","password":"Worker@123","role":"user"}')
echo "$USER_RES"
USER_ID=$(echo "$USER_RES" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')

echo "== 3. Admin creates a project managed by manager =="
PROJECT_RES=$(curl -s -X POST "$BASE_URL/api/projects" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{\"project_name\":\"Smoke Test Project\",\"manager_id\":$MANAGER_ID}")
echo "$PROJECT_RES"
PROJECT_ID=$(echo "$PROJECT_RES" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')

echo "== 4. Admin creates a digital_work assigned to the user =="
WORK_RES=$(curl -s -X POST "$BASE_URL/api/works" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{\"task_name\":\"Smoke Test Task\",\"project_id\":$PROJECT_ID,\"assigned_to\":$USER_ID}")
echo "$WORK_RES"
WORK_ID=$(echo "$WORK_RES" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')

echo "== 5. User logs in and updates own progress (expect 200) =="
USER_LOGIN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"worker.test@example.com","password":"Worker@123"}')
USER_TOKEN=$(echo "$USER_LOGIN" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

curl -s -X PATCH "$BASE_URL/api/works/$WORK_ID/progress" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"progress_percent":50,"progress_comment":"Dang lam"}'
echo

echo "== 6. User creates own task plan step (expect 201) =="
curl -s -X POST "$BASE_URL/api/works/$WORK_ID/plans" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"step_name":"Buoc 1: Khao sat","step_order":1}'
echo

echo "== 7. User tries to update someone else's work (expect 403) =="
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X PATCH "$BASE_URL/api/works/999999/progress" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"progress_percent":10}'

echo "== Done =="
