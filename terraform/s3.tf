# =============================================================================
# S3 — 프론트엔드 정적 파일 저장소
# =============================================================================
#
# [역할]
# 온프레미스 Nginx의 정적 파일 서빙을 대체한다.
# npm run build로 생성된 HTML/JS/CSS 파일을 저장하고,
# CloudFront가 OAC(Origin Access Control)를 통해 접근하여 사용자에게 전달.
#
# [보안 원칙]
#   - S3 버킷 자체는 완전 비공개 (퍼블릭 액세스 전부 차단)
#   - CloudFront OAC로만 접근 허용 → 직접 S3 URL로는 접근 불가
#   - 서버사이드 암호화 (AES-256) 적용
#
# [배포 방법]
#   npm run build
#   aws s3 sync dist/ s3://<버킷이름>/ --delete
#   aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
# =============================================================================


# -----------------------------------------------------------------------------
# [S3 Bucket] 프론트엔드 빌드 결과물을 저장하는 버킷.
#
#   bucket : 전역 고유 이름. terraform.tfvars에서 지정.
#            예: "team2-queuing"
#
# force_destroy : true = 버킷에 파일이 남아있어도 terraform destroy로 삭제 가능.
#                 프로덕션에서는 false로 변경하여 실수 방지 권장.
# -----------------------------------------------------------------------------
resource "aws_s3_bucket" "frontend" {
  bucket        = var.frontend_bucket_name
  force_destroy = var.environment != "prod"

  tags = { Name = "${local.name_prefix}-frontend" }
}

# -----------------------------------------------------------------------------
# [버전 관리] 파일 덮어쓰기 시 이전 버전을 보관.
#
# 잘못된 배포 시 이전 버전으로 복구 가능.
# 다만 스토리지 비용이 누적되므로, 라이프사이클 규칙으로 오래된 버전 자동 삭제 권장.
# -----------------------------------------------------------------------------
resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}

# -----------------------------------------------------------------------------
# [서버사이드 암호화] 저장 데이터를 AES-256으로 자동 암호화.
#
# 정적 파일이라 민감 데이터는 없지만, AWS 보안 모범 사례로 항상 활성화.
# SSE-S3 = AWS 관리형 키 사용 (추가 비용 없음).
# -----------------------------------------------------------------------------
resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# -----------------------------------------------------------------------------
# [퍼블릭 액세스 차단] S3 버킷을 완전히 비공개로 설정.
#
# 4가지 차단 옵션을 모두 활성화:
#   block_public_acls       : ACL로 퍼블릭 접근 설정 차단
#   ignore_public_acls      : 기존 퍼블릭 ACL이 있어도 무시
#   block_public_policy     : 퍼블릭 버킷 정책 설정 차단
#   restrict_public_buckets : 퍼블릭 버킷 정책의 접근을 제한
#
# → CloudFront OAC만 접근 가능. S3 URL 직접 접근 불가.
# -----------------------------------------------------------------------------
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# [버킷 정책] CloudFront OAC에게만 S3 읽기 권한을 부여.
#
# Condition의 AWS:SourceArn으로 특정 CloudFront 배포만 허용.
# → 다른 CloudFront 배포나 AWS 서비스는 접근 불가.
#
# 이 정책이 있어야 CloudFront가 S3에서 파일을 가져올 수 있다.
# OAC 없이 퍼블릭으로 열지 않는 이유: 보안 + S3 직접 접근 차단.
# -----------------------------------------------------------------------------
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
        }
      }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}
