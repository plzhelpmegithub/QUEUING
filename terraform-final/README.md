# terraform-final — QUEUING AWS 인프라 (통합본)

네 사람이 각자 만든 테라폼을 하나로 합친 것이다. **여기가 유일한 배포 대상**이며,
각자 브랜치의 `terraform/` 폴더는 참고용으로 남긴다.

## 무엇을 어디서 가져왔나

| 영역 | 출처 | 가져온 이유 |
| --- | --- | --- |
| 실행 기반 (EKS) | 지예 C · 예지 D | 두 안이 일치. Helm 차트·HPA·KEDA·ArgoCD 가 그대로 옮겨간다 |
| 서브넷 계산 `cidrsubnet` + `count` | 찬규 A · 예지 D | 두 안이 일치. AZ 를 늘려도 손댈 곳이 없다 |
| 가용영역 자동 조회 | 예지 D | AZ 이름 하드코딩 제거 |
| EKS 서브넷 태그 | 예지 D | `kubernetes.io/role/elb` — LB Controller 전환 대비 |
| **IRSA (OIDC 공급자)** | 예지 D | 세 안 중 유일. ServiceAccount 별 권한 분리 |
| **EBS CSI (IRSA 방식)** | 예지 D | 노드 역할에 붙이는 것보다 안전 |
| **SES** | 예지 D | `ses_smtp_password_v4` 변환까지 정확 |
| **RDS MariaDB** | 찬규 A | D-Cloud 평문 인터넷 구간이 사라진다 |
| **IMDSv2 강제 · EBS 암호화** | 찬규 A | 표준 보안 설정 |
| **`default_tags`** | 찬규 A | 비용 추적 |
| **S3 + DynamoDB 백엔드** | 찬규 A | 상태 파일 공유·잠금 (주석 상태) |
| **`terraform.tfvars.example`** | 찬규 A | 무엇을 채워야 하는지 명확 |
| **SQS + DLQ + DynamoDB** | 건아 B | LocalStack provider 만 제거하고 리소스는 그대로 |
| ALB (WebSocket 지원) | 지예 C | 다른 안에는 `idle_timeout`·세션 고정·`/ws` 라우팅이 없다 |
| Route 53 + ACM ×2 | 지예 C | CloudFront 는 us-east-1 인증서가 별도로 필요 |
| ElastiCache | 지예 C | `notify-keyspace-events` 파라미터 그룹 포함 |
| 팀원 IAM · EKS 권한 | 지예 C | 네임스페이스별 편집 권한 |

## 파일 구성

| 파일 | 내용 |
| --- | --- |
| `main.tf` | 프로바이더 · `default_tags` · 원격 백엔드(주석) |
| `variables.tf` · `terraform.tfvars.example` | 변수 |
| `vpc.tf` | VPC · 서브넷 · NAT Gateway · 라우팅 |
| `security_groups.tf` | ALB · EKS 노드 · Redis · RDS |
| `eks.tf` | 클러스터 · 노드그룹 · 런치 템플릿 |
| `irsa.tf` | OIDC 공급자 · EBS CSI · KEDA 역할 |
| `eks_access.tf` | 팀원별 네임스페이스 권한 |
| `alb.tf` | ALB · 타겟그룹 · HTTPS · WebSocket 라우팅 |
| `dns_acm.tf` | Route 53 · ACM 인증서 2장 |
| `s3_cloudfront.tf` | 프론트엔드 정적 호스팅 |
| `elasticache.tf` | Redis |
| `rds.tf` | MariaDB |
| `sqs.tf` | 재판매 큐 · DLQ · DynamoDB |
| `ses.tf` | 메일 발송 |
| `ecr.tf` | 컨테이너 이미지 저장소 |
| `iam_team.tf` | 팀원 IAM 계정 |
| `outputs.tf` | 접속 정보 · 배포 후 체크리스트 |

## 실행

`.kr` 도메인은 Route 53 에서 등록이 안 된다. 호스팅케이알에서 산 도메인의
네임서버를 바꿔야 하고 반영에 시간이 걸린다. 그 전에는 ACM 검증이 끝나지 않아
`terraform apply` 가 대기 상태로 멈춘다.

```bash
export TF_VAR_db_password='...'
cp terraform.tfvars.example terraform.tfvars   # 값 채우기

terraform init

# 1) 호스팅 영역만 먼저 만들고 네임서버를 등록기관에 등록
terraform apply -target=aws_route53_zone.main
terraform output route53_nameservers

# 2) 반영 확인 — 위 4개가 그대로 나와야 한다
dig NS queuing.kr +short

# 3) 전체 배포 (20~30분, EKS 생성이 대부분)
terraform apply
```

도메인 없이 먼저 검증하려면 `domain_name = ""` 로 두면 Route 53·ACM 관련
리소스를 만들지 않는다.

## 배포 후

```bash
terraform output post_apply_checklist
terraform output irsa_setup_commands
```

특히 **metrics-server** 는 EKS 가 기본 제공하지 않는다. 없으면 모든 HPA 가
`<unknown>` 으로 뜨고 오토스케일링이 전혀 동작하지 않는다.

## 온프레미스에서 달라지는 것

| | 온프레미스 | AWS |
| --- | --- | --- |
| Redis | 클러스터 안 파드 (비밀번호 없음) | ElastiCache (Multi-AZ 자동 장애조치) |
| DB | D-Cloud 공인망 · 평문 | RDS (VPC 내부 · 저장 암호화) |
| SQS | LocalStack (재시작하면 큐 소실) | SQS (관리형) |
| KEDA 인증 | Secret 에 더미 키 | IRSA (키 불필요) |
| 메일 | Gmail SMTP · LocalStack SES | SES |
| 볼륨 | hostPath (노드 고정) | EBS CSI (자동 생성) |
| 이미지 | Docker Hub | ECR |

### KEDA 설정에서 바꿔야 할 것

```yaml
triggers:
  - type: aws-sqs-queue
    metadata:
      queueURL: <terraform output -raw sqs_queue_url>
      awsRegion: ap-northeast-2
      # awsEndpoint 제거 — LocalStack 전용이었다
    # authenticationRef 제거 — IRSA 로 대체
```

## 주의

- **비밀번호는 커밋하지 않는다.** `tfstate` 에는 DB 비밀번호와 팀원 IAM
  자격증명이 평문으로 남는다. `.gitignore` 로 제외되어 있다.
- **`eks_cluster_version` 을 1.33 이하로 내리지 않는다.** 확장 지원 구간이라
  컨트롤플레인 요금이 시간당 $0.10 → $0.60 으로 6배가 된다(월 $73 → $438).
- **`nodeport_api` / `nodeport_ws` 는 각 파트 Helm 차트의 값과 같아야 한다.**
  다르면 ALB 헬스체크가 전부 실패해 해당 파트가 통째로 unhealthy 가 된다.
