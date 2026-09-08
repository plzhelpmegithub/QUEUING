# =============================================================================
# EC2 Auto Scaling Group — API 서버 (ECS Fargate 대체)
# =============================================================================
#
# [역할]
# Docker 컨테이너를 EC2 인스턴스에서 직접 실행한다.
# ECS Fargate 대비 장점:
#   - AMI를 직접 지정하여 OS 레벨 커스터마이징 가능
#   - SSH/SSM 접속으로 인스턴스 내부 디버깅 가능
#   - GPU, 대용량 메모리 등 다양한 인스턴스 타입 선택 가능
#   - 예약 인스턴스/스팟 인스턴스로 비용 최적화 가능
#
# [K8s 대비 매핑]
#   K8s Deployment + Pod → EC2 Auto Scaling Group + Launch Template
#   K8s HPA              → Auto Scaling Policy (CPU Target Tracking)
#   K8s livenessProbe    → ALB Health Check (Target Group)
#   K8s Secret           → Secrets Manager (secrets.tf)
#   K8s ConfigMap        → User Data 스크립트 내 환경변수
#
# [구성 요소 목록]
#   1. CloudWatch Log Group   : 컨테이너/앱 로그 저장
#   2. IAM Role + Profile     : EC2가 AWS 서비스 호출 시 사용하는 권한
#   3. Launch Template        : AMI, 인스턴스 타입, User Data, SG 등 정의
#   4. Auto Scaling Group     : 인스턴스를 원하는 수만큼 유지 + ALB 연결
#   5. Auto Scaling Policy    : CPU 기반 자동 스케일링
#
# [트래픽 흐름]
#   사용자 → ALB:80/443 → EC2:3000 (Private Subnet) → Redis/RDS
# =============================================================================


# -----------------------------------------------------------------------------
# [1] CloudWatch Log Group — 앱 로그 수집·조회
#
# CloudWatch Agent 또는 Docker 로그 드라이버로 로그를 전송한다.
# AWS 콘솔에서 실시간 로그 확인, 필터 패턴으로 에러 검색, 알람 설정 가능.
#
#   name              : 로그 그룹 경로 (/ec2/queuing-prod-api 형태)
#   retention_in_days : 14일간 보관. 이후 자동 삭제 (비용 절감).
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "api" {
  name              = "/ec2/${local.name_prefix}-api"
  retention_in_days = 14

  tags = { Name = "${local.name_prefix}-api-logs" }
}


# =============================================================================
# [2] IAM Role + Instance Profile — EC2 인스턴스에 부여하는 AWS 권한
# =============================================================================
#
# EC2 인스턴스가 AWS 서비스(Secrets Manager, CloudWatch, SES 등)를
# 호출하려면 IAM Role이 필요하다. Instance Profile은 Role을 EC2에 연결하는 래퍼.
#
# [부여하는 권한]
#   1. AmazonSSMManagedInstanceCore : SSM Session Manager로 SSH 없이 접속
#   2. CloudWatchAgentServerPolicy  : CloudWatch에 로그/메트릭 전송
#   3. secrets-access (인라인)      : Secrets Manager에서 시크릿 읽기
#   4. ses-send (인라인)            : SES로 이메일 발송 (예매 확인 메일 등)
# =============================================================================

# --- IAM Role 본체 (Trust Policy: ec2.amazonaws.com만 사용 가능) ---
resource "aws_iam_role" "ec2_api" {
  name = "${local.name_prefix}-ec2-api"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${local.name_prefix}-ec2-api-role" }
}

# --- Instance Profile: IAM Role을 EC2에 연결하는 래퍼 ---
resource "aws_iam_instance_profile" "api" {
  name = "${local.name_prefix}-api-profile"
  role = aws_iam_role.ec2_api.name
}

# --- AWS 관리형 정책: SSM Session Manager (SSH 키 없이 인스턴스 접속) ---
# 사용법: aws ssm start-session --target <instance-id>
resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  role       = aws_iam_role.ec2_api.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# --- AWS 관리형 정책: CloudWatch Agent (로그·메트릭 전송) ---
resource "aws_iam_role_policy_attachment" "ec2_cloudwatch" {
  role       = aws_iam_role.ec2_api.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

# --- 인라인 정책: Secrets Manager 읽기 (이 프로젝트 시크릿만) ---
resource "aws_iam_role_policy" "ec2_secrets" {
  name = "secrets-access"
  role = aws_iam_role.ec2_api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.api.arn]
    }]
  })
}

# --- 인라인 정책: SES 이메일 발송 ---
resource "aws_iam_role_policy" "ec2_ses" {
  name = "ses-send"
  role = aws_iam_role.ec2_api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource = ["*"]
    }]
  })
}


# =============================================================================
# [3] Launch Template — EC2 인스턴스 생성 명세
# =============================================================================
#
# Auto Scaling Group이 인스턴스를 시작할 때 이 템플릿을 참조한다.
# AMI, 인스턴스 타입, 보안그룹, IAM 프로필, User Data 등을 정의.
#
# [User Data 스크립트 동작]
#   1. Docker 설치 및 시작 (AMI에 미포함 시)
#   2. jq 설치 (JSON 파싱용)
#   3. Secrets Manager에서 민감 정보(DB_PASSWORD 등) 조회
#   4. Docker 이미지 Pull (Docker Hub 또는 ECR)
#   5. 환경변수를 주입하여 컨테이너 실행 (--restart unless-stopped)
#
# [version = "$Latest"]
#   Launch Template 수정 시 새 버전이 자동 생성되고,
#   ASG가 "$Latest"를 참조하므로 Instance Refresh 시 새 버전 적용.
# =============================================================================
resource "aws_launch_template" "api" {
  name_prefix   = "${local.name_prefix}-api-"
  image_id      = var.ec2_ami_id
  instance_type = var.ec2_instance_type

  # IAM 프로필 연결 → Secrets Manager, CloudWatch, SES 접근 가능
  iam_instance_profile {
    arn = aws_iam_instance_profile.api.arn
  }

  # 보안그룹 (ALB에서만 3000 포트 접근 허용)
  vpc_security_group_ids = [aws_security_group.ecs.id]

  # EBS 루트 볼륨 설정
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = var.ec2_volume_size
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  # 인스턴스 모니터링 (1분 간격 CloudWatch 메트릭. 기본 5분보다 상세)
  monitoring {
    enabled = true
  }

  # 인스턴스 메타데이터 서비스 v2 강제 (보안 강화)
  # IMDSv1은 SSRF 공격에 취약하므로 v2만 허용
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  # ─────────────────────────────────────────────────────────────────────────
  # User Data — 인스턴스 시작 시 자동 실행되는 초기화 스크립트
  #
  # Terraform의 templatefile()로 변수를 주입한다:
  #   ${redis_host}  → ElastiCache 엔드포인트
  #   ${db_host}     → RDS 엔드포인트
  #   ${secret_arn}  → Secrets Manager ARN
  #   ${image}       → Docker 이미지 (예: mover14/redis-api-backend:1.0.8)
  #   등등...
  # ─────────────────────────────────────────────────────────────────────────
  user_data = base64encode(templatefile("${path.module}/user_data.sh.tpl", {
    region                     = var.aws_region
    log_group                  = "/ec2/${local.name_prefix}-api"
    secret_arn                 = aws_secretsmanager_secret.api.arn
    image                      = "${var.api_image_repo}:${var.api_image_tag}"
    redis_host                 = aws_elasticache_cluster.redis.cache_nodes[0].address
    db_host                    = aws_db_instance.mariadb.address
    db_port                    = tostring(aws_db_instance.mariadb.port)
    db_user                    = var.db_username
    db_name                    = var.db_name
    recaptcha_enabled          = tostring(var.recaptcha_enabled)
    recaptcha_allowed_hostnames = var.recaptcha_allowed_hostnames
  }))

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${local.name_prefix}-api"
    }
  }

  tags = { Name = "${local.name_prefix}-api-lt" }

  lifecycle {
    create_before_destroy = true
  }
}


# =============================================================================
# [4] Auto Scaling Group — 인스턴스를 원하는 수만큼 유지 + ALB 연결
# =============================================================================
#
# K8s Deployment가 Pod를 desired 개수만큼 유지하는 것과 동일.
# 인스턴스가 비정상이면 자동으로 종료하고 새 인스턴스를 시작한다.
#
# [주요 속성]
#   desired_capacity     : 유지할 인스턴스 수 (기본 2)
#   min_size / max_size  : Auto Scaling 범위 (1~10)
#   vpc_zone_identifier  : Private Subnet에 인스턴스 배치
#   target_group_arns    : ALB Target Group에 인스턴스 자동 등록
#   health_check_type    : "ELB" = ALB 헬스체크 기준으로 인스턴스 교체
#   health_check_grace_period : 180초 = 시작 후 3분간 헬스체크 실패 무시
#                               (Docker Pull + 앱 초기화 시간 고려)
#
# [Instance Refresh]
#   Launch Template 변경 시 인스턴스를 순차적으로 교체 (Rolling Update).
#   min_healthy_percentage = 50 : 교체 중 최소 50% 인스턴스 유지.
# =============================================================================
resource "aws_autoscaling_group" "api" {
  name                = "${local.name_prefix}-api-asg"
  desired_capacity    = var.api_desired_count
  min_size            = var.api_min_count
  max_size            = var.api_max_count
  vpc_zone_identifier = aws_subnet.private[*].id
  target_group_arns   = [aws_lb_target_group.api.arn]

  # ALB 헬스체크 기준으로 비정상 인스턴스 교체
  health_check_type         = "ELB"
  health_check_grace_period = 180

  launch_template {
    id      = aws_launch_template.api.id
    version = "$Latest"
  }

  # Launch Template 변경 시 Rolling Update 자동 실행
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
    }
  }

  tag {
    key                 = "Name"
    value               = "${local.name_prefix}-api"
    propagate_at_launch = true
  }

  lifecycle {
    ignore_changes = [desired_capacity]
  }
}


# =============================================================================
# [5] Auto Scaling Policy — CPU 기반 자동 스케일링 (K8s HPA 대체)
# =============================================================================
#
# [K8s HPA 원본 설정]
#   minReplicas: 1, maxReplicas: 10, targetCPUUtilizationPercentage: 70
#
# [Target Tracking 동작]
#   CPU 평균 사용률이 70%를 넘으면 인스턴스 추가 (Scale Out)
#   CPU 평균 사용률이 70% 아래로 내려가면 인스턴스 제거 (Scale In)
#
# [Cooldown]
#   estimated_instance_warmup : 120초 = 새 인스턴스가 완전히 준비될 때까지
#   대기 시간. Docker Pull + 앱 시작을 고려하여 2분.
# =============================================================================
resource "aws_autoscaling_policy" "api_cpu" {
  name                   = "${local.name_prefix}-api-cpu-scaling"
  autoscaling_group_name = aws_autoscaling_group.api.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = var.api_autoscaling_cpu_target
  }

  estimated_instance_warmup = 120
}
