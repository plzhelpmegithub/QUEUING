# ──────────────────────────────────────────────
# Jenkins — 별도 EC2 (2026-09-09 팀 결정)
#
# ■ 왜 EKS 안이 아니라 EC2 인가
# 파드 안에서는 docker build 가 안 된다. 도커 데몬이 없기 때문이다.
# EKS 로 옮기려면 Kaniko/Buildah 로 Jenkinsfile 을 다시 써야 하는데, 지금
# Jenkinsfile 이 잘 돌고 있어서 그럴 이유가 없다. 노드 메모리도 총 8Gi 뿐이라
# Jenkins 컨트롤러(2Gi+)를 얹으면 빠듯하다.
#
# 온프레미스에서 마스터 노드에 Docker 로 띄워둔 것(192.168.0.192:8081)과
# 같은 형태다. 이미지도 온프레미스와 똑같이 Docker Hub 로 올린다.
# (2026-09-15: ECR 을 쓰지 않기로 해 ECR 저장소와 젠킨스 ECR 권한을 뺐다)
#
# ■ 액세스 키를 만들지 않는다
# EC2 인스턴스 프로파일로 필요한 AWS 권한(SSM 접속, 프론트엔드 S3 배포)을 준다.
# 젠킨스 안에 AWS 키를 넣을 필요가 없고, 유출될 키 자체가 존재하지 않는다.
# Docker Hub·GitHub 토큰은 Jenkins Credentials 에만 둔다.
#
# ■ 퍼블릭 서브넷에 두는 이유
# 깃허브 웹훅을 받아야 하고, 관리자가 웹 UI 에 접속해야 한다. 프라이빗에 두면
# 둘 다 별도 장치가 필요하다.
#
# ⚠️ 접속은 SSH 가 아니라 SSM 으로 한다 (22번 포트를 열지 않는다)
#   aws ssm start-session --target <인스턴스ID>
#   웹 UI 는 아래 jenkins_allowed_cidr 에 적은 주소에서만 열린다.
#
# ■ 끄려면
#   jenkins_enabled = false
# ──────────────────────────────────────────────

# ── Jenkins 가 맡을 역할 ──

resource "aws_iam_role" "jenkins" {
  count = var.jenkins_enabled ? 1 : 0

  name = "${var.project}-jenkins"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.project}-jenkins-role" }
}

# ── 프론트엔드 배포 권한 (S3 + CloudFront) ──
#
# ■ 왜 테라폼이 파일을 올리지 않나
# 테라폼은 인프라를 만들고, 빌드 산출물은 CI 가 올린다.
#   - aws_s3_object 로 올리면 빌드마다 파일 해시가 바뀌어 plan 이 매번
#     수백 개 변경으로 뜬다
#   - terraform destroy 가 웹사이트 파일까지 지운다
#   - 프론트 배포는 하루에도 여러 번, 인프라 변경은 가끔이다. 묶으면
#     배포할 때마다 인프라 권한이 필요해진다
#   - CloudFront 캐시 무효화를 테라폼으로 다룰 방법이 마땅치 않다
#
# 그래서 테라폼은 "권한과 주소"까지만 준다.
# 실제 배포 명령은 terraform output frontend_deploy_guide 참고.
#
# ■ Resource 를 좁힌다
# S3 는 이 버킷으로만, CloudFront 는 이 배포로만 제한한다. 계정에 다른
# 버킷이 생겨도 젠킨스가 건드리지 못한다.
resource "aws_iam_role_policy" "jenkins_frontend" {
  count = var.jenkins_enabled ? 1 : 0

  name = "frontend-deploy"
  role = aws_iam_role.jenkins[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # aws s3 sync 는 목록을 읽어 비교한 뒤 바뀐 것만 올린다.
        Sid      = "S3ListBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = [aws_s3_bucket.frontend.arn]
      },
      {
        # --delete 로 지워진 파일을 정리하려면 DeleteObject 가 필요하다.
        # 버저닝이 켜져 있어 지워도 30일간 이전 버전으로 남는다.
        Sid    = "S3ReadWrite"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = ["${aws_s3_bucket.frontend.arn}/*"]
      },
      {
        # 캐시 무효화. 이게 없으면 새 파일을 올려도 CloudFront 가 최대
        # 1시간(default_ttl 3600) 동안 옛 파일을 계속 준다.
        Sid    = "CloudFrontInvalidate"
        Effect = "Allow"
        Action = [
          "cloudfront:CreateInvalidation",
          "cloudfront:GetInvalidation",
          "cloudfront:ListInvalidations",
        ]
        Resource = [aws_cloudfront_distribution.frontend.arn]
      },
    ]
  })
}

# SSM 접속 — SSH 키와 22번 포트를 없애기 위한 것.
resource "aws_iam_role_policy_attachment" "jenkins_ssm" {
  count = var.jenkins_enabled ? 1 : 0

  role       = aws_iam_role.jenkins[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "jenkins" {
  count = var.jenkins_enabled ? 1 : 0

  name = "${var.project}-jenkins"
  role = aws_iam_role.jenkins[0].name
}

# ── 보안 그룹 ──
#
# 22번(SSH)을 열지 않는다. 접속은 SSM 이 담당한다.
resource "aws_security_group" "jenkins" {
  count = var.jenkins_enabled ? 1 : 0

  name_prefix = "${var.project}-jenkins-"
  vpc_id      = aws_vpc.main.id
  description = "Jenkins - web UI and outbound"

  ingress {
    description = "Jenkins web UI 8080 - only from jenkins_allowed_cidr"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = var.jenkins_allowed_cidr
  }

  egress {
    description = "ECR push, git clone, package install"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-sg-jenkins" }

  lifecycle { create_before_destroy = true }
}

# ── 인스턴스 ──

data "aws_ami" "al2023" {
  count = var.jenkins_enabled ? 1 : 0

  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
}

resource "aws_instance" "jenkins" {
  count = var.jenkins_enabled ? 1 : 0

  # jenkins_ami_id 를 주면 destroy 전에 떠둔 백업 AMI 로 만든다 (잡·플러그인·자격증명·swap 이 그대로 있다).
  # 비워두면 최신 Amazon Linux 2023 으로 새로 설치한다.
  ami                  = var.jenkins_ami_id != "" ? var.jenkins_ami_id : data.aws_ami.al2023[0].id
  instance_type        = var.jenkins_instance_type
  subnet_id            = aws_subnet.public[0].id
  iam_instance_profile = aws_iam_instance_profile.jenkins[0].name

  vpc_security_group_ids = [aws_security_group.jenkins[0].id]

  # SSH 키를 지정하지 않는다. 접속은 SSM 으로 한다.

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # IMDSv2 강제
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_size = var.jenkins_volume_size
    volume_type = "gp3"
    encrypted   = true
    # ⚠️ true 로 바꿨다 (2026-09-09).
    # false 로 두면 destroy 후에도 볼륨이 남는데, 다시 apply 해도 테라폼이
    # 그 볼륨을 새 인스턴스에 다시 붙여주지 않는다. 결과적으로 젠킨스 설정은
    # 어차피 사라지고 요금만 내는 고아 볼륨이 apply 할 때마다 하나씩 쌓인다.
    #
    # 젠킨스 설정을 유지하려면 apply/destroy 대상에서 빼는 편이 낫다:
    #   jenkins_enabled = false 로 두고 젠킨스는 계속 켜두거나,
    #   Jenkins Configuration as Code(JCasC)로 설정을 깃에 넣는다.
    delete_on_termination = true
  }

  # Docker 와 Jenkins 설치. 젠킨스 자체 설정(플러그인·잡)은 웹 UI 에서 한다.
  # ⚠️ 이 스크립트는 실제로 실행해보지 않았다. 부팅 후 반드시 로그를 확인할 것.
  #   aws ssm start-session --target <인스턴스ID>
  #   sudo tail -100 /var/log/cloud-init-output.log
  #
  # set -e 를 쓰지 않는다. 한 줄이 실패해도 나머지를 계속 시도하고, set -x 로
  # 모든 명령이 로그에 남게 한다. 중간에 죽어서 아무 흔적 없이 8080 이 비어
  # 있는 것보다 낫다.
  # 백업 AMI 로 만들 때는 설치 스크립트를 돌리지 않는다. 이미 설치돼 있고,
  # dnf update 가 Jenkins 를 새 버전으로 올려 플러그인이 안 맞을 수 있어서다.
  user_data = var.jenkins_ami_id != "" ? null : <<-SCRIPT
    #!/bin/bash
    set -x

    dnf update -y
    dnf install -y docker git

    # Java — Jenkins 는 17 이상이 필요하다. AL2023 의 패키지 이름을 확신할 수
    # 없어 순서대로 시도한다. 셋 다 실패하면 아래 jenkins 설치가 의존성으로
    # 알아서 끌어온다.
    dnf install -y java-21-amazon-corretto       || dnf install -y java-17-amazon-corretto       || dnf install -y java-17-amazon-corretto-headless       || true

    systemctl enable --now docker

    # ⚠️ wget 을 쓰지 않는다 — AL2023 에 기본 설치되어 있지 않다.
    #   https://docs.aws.amazon.com/linux/al2023/ug/image-comparison.html
    # curl(정확히는 curl-minimal)은 기본으로 들어 있다.
    curl -fsSL -o /etc/yum.repos.d/jenkins.repo       https://pkg.jenkins.io/redhat-stable/jenkins.repo

    # ⚠️ 이 키 파일 이름은 젠킨스 측에서 바뀔 수 있다. 실패하면 아래 주소에서
    #    현재 키 이름을 확인할 것: https://pkg.jenkins.io/redhat-stable/
    rpm --import https://pkg.jenkins.io/redhat-stable/jenkins.io-2023.key

    dnf install -y jenkins

    # 젠킨스가 docker build 를 하려면 도커 그룹에 있어야 한다.
    # 반드시 젠킨스를 시작하기 전에 해야 반영된다.
    usermod -aG docker jenkins

    systemctl enable --now jenkins

    # AWS CLI 는 AL2023 에 기본 포함되어 있다. 확인만 남긴다.
    aws --version || echo "AWS CLI 없음 — ECR 로그인이 안 된다"

    echo "=== 부트스트랩 종료 $(date -Iseconds) ==="
    systemctl is-active docker jenkins || true
  SCRIPT

  # user_data 를 바꾸면 인스턴스가 교체된다. 젠킨스 설정이 날아가므로
  # 최초 생성 후에는 무시한다. 스크립트를 바꿔야 하면 이 줄을 잠시 지운다.
  lifecycle {
    ignore_changes = [user_data, ami]
  }

  tags = { Name = "${var.project}-jenkins" }
}

# 고정 주소. 없으면 인스턴스를 재시작할 때마다 IP 가 바뀌어서
# 깃허브 웹훅 주소를 매번 고쳐야 한다.
resource "aws_eip" "jenkins" {
  count = var.jenkins_enabled ? 1 : 0

  domain   = "vpc"
  instance = aws_instance.jenkins[0].id

  tags = { Name = "${var.project}-jenkins-eip" }
}

variable "jenkins_ami_id" {
  description = "비워두면 새로 설치, AMI ID 를 넣으면 그 백업으로 Jenkins 를 만든다 (destroy 전에 aws ec2 create-image 로 뜬 것)."
  type        = string
  default     = ""
}
