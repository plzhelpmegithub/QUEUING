#!/bin/bash
# =============================================================================
# EC2 User Data — 인스턴스 시작 시 자동 실행되는 초기화 스크립트
# =============================================================================
# Terraform templatefile()에 의해 $${} 변수가 실제 값으로 치환된다.
# 실행 로그: /var/log/cloud-init-output.log 에서 확인 가능.
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# [1단계] Docker 설치 및 시작
# Amazon Linux 2의 경우 amazon-linux-extras로 설치.
# 이미 설치되어 있으면 건너뜀.
# -----------------------------------------------------------------------------
if ! command -v docker &> /dev/null; then
  yum update -y
  amazon-linux-extras install docker -y || yum install -y docker
  systemctl enable docker
  systemctl start docker
else
  systemctl start docker || true
fi

# jq 설치 (JSON 파싱용 — Secrets Manager 응답 처리)
yum install -y jq || true

# -----------------------------------------------------------------------------
# [2단계] Secrets Manager에서 민감 정보 조회
# IAM Instance Profile 권한으로 AWS CLI가 자동 인증된다.
# -----------------------------------------------------------------------------
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "${secret_arn}" \
  --query SecretString \
  --output text \
  --region "${region}")

DB_PASSWORD=$(echo "$SECRET_JSON" | jq -r '.DB_PASSWORD')
SMTP_USER=$(echo "$SECRET_JSON" | jq -r '.SMTP_USER')
SMTP_PASS=$(echo "$SECRET_JSON" | jq -r '.SMTP_PASS')
RECAPTCHA_SECRET_KEY=$(echo "$SECRET_JSON" | jq -r '.RECAPTCHA_SECRET_KEY')

# -----------------------------------------------------------------------------
# [3단계] Docker 이미지 Pull
# Docker Hub에서 직접 Pull. Rate Limit: 인증 없이 6시간/100회.
# ECR로 전환 시 aws ecr get-login-password로 인증 후 Pull.
# -----------------------------------------------------------------------------
docker pull "${image}"

# -----------------------------------------------------------------------------
# [4단계] API 컨테이너 실행
# --restart unless-stopped : 컨테이너 크래시 시 자동 재시작, 인스턴스 재부팅 후도 유지.
# -p 3000:3000             : 호스트 포트 3000 → 컨테이너 포트 3000 매핑.
#                            ALB Target Group이 이 포트로 트래픽 전달.
# 환경변수:
#   - NODE_ENV, PORT, BATCH_SIZE       : 앱 기본 설정
#   - NODE_OPTIONS                     : V8 힙 메모리 제한 (OOM 방지)
#   - REDIS_HOST/PORT                  : ElastiCache 엔드포인트
#   - DB_HOST/PORT/USER/NAME/PASSWORD  : RDS MariaDB 연결 정보
#   - SMTP_HOST/PORT/USER/PASS         : Gmail SMTP 설정
#   - RECAPTCHA_*                      : reCAPTCHA 봇 방지 설정
# -----------------------------------------------------------------------------
docker run -d \
  --name api \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e "NODE_OPTIONS=--max-old-space-size=400" \
  -e PORT=3000 \
  -e BATCH_SIZE=100 \
  -e "REDIS_HOST=${redis_host}" \
  -e REDIS_PORT=6379 \
  -e "DB_HOST=${db_host}" \
  -e "DB_PORT=${db_port}" \
  -e "DB_USER=${db_user}" \
  -e "DB_NAME=${db_name}" \
  -e "DB_PASSWORD=$DB_PASSWORD" \
  -e SMTP_HOST=smtp.gmail.com \
  -e SMTP_PORT=587 \
  -e "SMTP_USER=$SMTP_USER" \
  -e "SMTP_PASS=$SMTP_PASS" \
  -e "RECAPTCHA_REQUIRED=${recaptcha_enabled}" \
  -e RECAPTCHA_SCORE_THRESHOLD=0.5 \
  -e "RECAPTCHA_ALLOWED_HOSTNAMES=${recaptcha_allowed_hostnames}" \
  -e "RECAPTCHA_SECRET_KEY=$RECAPTCHA_SECRET_KEY" \
  "${image}"

# -----------------------------------------------------------------------------
# [5단계] 초기화 완료 로그
# /var/log/cloud-init-output.log에서 확인 가능.
# -----------------------------------------------------------------------------
echo "[$(date)] API 컨테이너 시작 완료: ${image}"
