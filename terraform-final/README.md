# terraform-final — QUEUING AWS 인프라 (통합본)

네 사람이 각자 만든 테라폼을 하나로 합친 것이다. **여기가 유일한 배포 대상**이며,
각자 브랜치의 `terraform/` 폴더는 참고용으로 남긴다.

| 통합 | 시점 | 기준 커밋 |
| --- | --- | --- |
| 1차 | 2026-09-09 13:54 | chan `1e3f69c` · yeji `19f4997` · geonah `b921862` |
| 2차 | 2026-09-09 | chan `145d3f1` — EC2 ASG → EKS 전환, WAF·Secrets Manager 추가 |

2차 내역은 맨 아래 "2차 통합" 절에 있다.

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
| `waf.tf` | CloudFront WAF (2차) |
| `secrets.tf` | Secrets Manager (2차) |
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

### ⚠️ 정정 — `domain_name = ""` 는 동작하지 않는다

1차 README 에 "도메인 없이 먼저 검증하려면 `domain_name = ""` 로 두면 된다"고
적었는데 **사실이 아니다.** 확인해보니 ACM 인증서, Route 53 레코드, ALB HTTPS
리스너, CloudFront `aliases`/`viewer_certificate` 어디에도 `count` 가 걸려 있지
않다. `domain_name = ""` 로 두면 `local.api_domain` 이 `"."`, `local.www_domain`
이 `"www."` 가 되고 ACM 인증서 요청이 바로 실패한다.

**도메인은 필수다.** 도메인 없이 일부만 미리 만들어 보려면 `-target` 을 쓴다.

```bash
# VPC·서브넷·NAT 만 먼저 (약 3분, DNS 무관)
terraform apply -target=aws_nat_gateway.main

# EKS 까지 (약 15분, DNS 무관)
terraform apply -target=aws_eks_node_group.main
```

ACM·Route 53·ALB HTTPS·CloudFront 는 네임서버가 Route 53 을 가리킨 뒤에만 된다.

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


---

# 2차 통합 — 찬규님 EKS 전환 반영 (2026-09-09)

찬규님이 `145d3f1` 에서 **EC2 Auto Scaling Group 을 버리고 EKS 로 전환**했다.
1차 통합 시점에는 찬규 안이 EC2 ASG 였고 EKS 는 지예·예지 안에만 있었다.
이제 네 사람 전원이 EKS 기준이 되어 실행 기반 논쟁이 끝났다.

## 가져온 것

| 가져온 것 | 출처 | 왜 |
| --- | --- | --- |
| **WAF** (`waf.tf`) | 찬규 A | 세 안 중 유일. 티켓 오픈 때 매크로를 ALB 앞에서 자름 |
| **Secrets Manager** (`secrets.tf`) | 찬규 A | 세 안 중 유일. K8s Secret 은 base64 일 뿐 암호화가 아님 |
| **`enabled_cluster_log_types`** | 찬규 A | 내 쪽은 로그 그룹만 만들고 내보내기를 안 켜서 **내용이 비어 있었다** |
| **EKS 애드온** vpc-cni · kube-proxy · coredns | 찬규 A | 버전 호환을 AWS 가 보장. 온프레미스에서 1.31.14 에 묶였던 이유가 이것 |
| **`AmazonSSMManagedInstanceCore`** | 찬규 A | 프라이빗 서브넷 노드에 들어갈 유일한 방법 |
| **`ignore_changes = [desired_size]`** | 찬규 A | 부하 중 apply 가 노드 수를 되돌리는 것 방지 |
| **애플리케이션 로그 그룹** | 찬규 A | 파드가 죽어도 로그가 남음 |
| **ElastiCache 스냅샷·유지보수 창** | 찬규 A | 9/5 Redis 장애 때 백업이 아예 없었다 |
| **`redis_num_replicas` 변수화** | 찬규 A | 비용 조절 지점을 하나 만듦 |
| **CloudFront AAAA (IPv6)** | 찬규 A | 모바일 IPv6 경로 |
| **`AL2023_x86_64_STANDARD`** | 지예 C (수정) | 찬규 안의 `AL2_x86_64` 는 1.34 에서 **생성 실패**한다 |

## 내 것을 유지한 부분

| 유지한 것 | 왜 찬규 안을 안 쓰는지 |
| --- | --- |
| **ALB** (`alb.tf`) | 찬규 안에는 아직 `idle_timeout`·세션 고정·`/ws` 라우팅·WS 타겟그룹이 없다. 그대로 쓰면 WebSocket 이 60초마다 끊긴다 |
| **ElastiCache 파라미터 그룹** | 찬규 안은 `default.redis7` 이라 `notify-keyspace-events=Ex` 가 빠진다. A파트의 10분 결제 타이머 → 좌석 자동 해제가 동작하지 않는다 |
| **IRSA** (`irsa.tf`) | 찬규 안은 SES 권한을 **노드 역할**에 붙인다. 그러면 그 노드의 모든 파드가 메일을 보낼 수 있다. 찬규님 본인 주석에도 "프로덕션 권장: IRSA" 라고 적혀 있다 |
| **EBS CSI 애드온** | 찬규 안에 없다. 없으면 PVC 가 영원히 Pending — Prometheus·Redis 가 못 뜬다 |
| **`eks_cluster_version = 1.34`** | 찬규 안은 `1.30` (확장 지원). 컨트롤플레인이 월 $73 → $438 |
| **EKS Access Entry** (`eks_access.tf`) | 찬규 안에 팀원 권한 설정이 없다 |
| **Route 53 기존 영역 재사용** | 찬규 안은 `aws_route53_zone` 을 항상 만든다. 콘솔에서 이미 만든 상태라 2개가 된다 |
| **SQS + DLQ + DynamoDB** | 건아 B 안. 찬규 안에 없다 |

## ⚠️ 팀 확인이 필요한 것 — RDS

찬규님이 `rds.tf` 를 주석만 남기고 비웠다. **외부 D-Cloud MariaDB 를 계속 쓴다**는 결정이다.

DB 는 A파트 소유라 그 결정을 따라 `use_rds` 기본값을 `false` 로 바꿨다.
`rds.tf` 는 지우지 않았으니 `use_rds = true` 한 줄로 되돌릴 수 있다.

따라오는 비용은 이것이다.

- EKS 파드 → NAT → 인터넷 → D-Cloud `211.46.52.164:13306` 구간이 **평문**이다.
  MySQL 프로토콜은 기본이 암호화가 아니고, D-Cloud 인증서가 자체 서명이라
  클라이언트가 `--skip-ssl` 로 검증을 끈 상태다. 그 구간을 지나는 것은
  DB 계정과 예매 조회 결과 전체다.
- **NAT EIP 를 D-Cloud 화이트리스트에 등록해야 한다.** 안 하면 apply 는
  성공하는데 파드가 DB 에 못 붙는다. `terraform output nat_eip` 로 주소를 얻는다.
- 자동 백업·저장 암호화·Multi-AZ 가 없다.
- NAT 데이터 처리 요금이 DB 트래픽만큼 추가된다($0.045/GB).

발표에서 "왜 DB 만 AWS 밖인가"를 받을 가능성이 높다. 데이터 이전 일정 때문이라면
그렇게 답하면 되고, 근거를 정리해두는 편이 낫다.

## ⚠️ WAF 와 부하 테스트

`waf_rate_limit` 기본값은 같은 IP 에서 **5분간 2,000건**이다.

JMeter 를 한 대에서 돌리면 가상 사용자 100명이 모두 같은 출처 IP 로 보인다.
100명 × 5분이면 2,000건을 금방 넘겨 WAF 가 차단하고, 결과 화면에는 그냥
실패·지연으로만 나온다. "AWS 가 느리다"와 "WAF 가 막았다"를 구분할 수 없다.

테스트 전에 `waf_enabled = false` 로 두고, 끝나면 되돌린다.
차단 여부는 CloudWatch 지표 `queuing-rate-limit` 에서 확인할 수 있다.

## AL2 → AL2023

찬규 안은 `ami_type = "AL2_x86_64"` 다. 찬규님 기본 버전이 `1.30` 이라 그쪽에서는
문제가 없지만, 통합본은 `1.34` 라서 그대로 쓰면 **노드그룹 생성이 실패한다.**

AL2 기반 EKS 최적화 AMI 는 K8s **1.32 까지만** 배포되고 2025-11-26 에 발행이
중단됐다. 1.33 부터는 AL2023 또는 Bottlerocket 만 나온다.

- https://docs.aws.amazon.com/eks/latest/userguide/eks-ami-deprecation-faqs.html
- https://docs.aws.amazon.com/eks/latest/userguide/eks-optimized-ami.html

AL2 → AL2023 은 cgroup v1 → v2 전환을 포함하지만, 앱이 cgroup 경로를 직접 읽지
않으면 영향이 없다 — 우리 네 파트 모두 해당 없음.

## 남은 연결 작업 (apply 만으로는 안 되는 것)

| 할 일 | 왜 |
| --- | --- |
| **metrics-server 설치** | EKS 는 기본 제공하지 않는다. 없으면 HPA 전부 `<unknown>` |
| **Secrets Manager → 파드 연결** | External Secrets Operator 또는 Secrets Store CSI Driver 를 깔고, `terraform output secrets_read_policy_arn` 정책을 그 ServiceAccount 역할에 붙인다 |
| **Fluent Bit 설치** | 로그 그룹만 만들어뒀다. 파드 로그를 보내려면 DaemonSet 이 필요하다 |
| **Cluster Autoscaler 또는 Karpenter** | `ignore_changes` 는 "자동 확장이 건드려도 되돌리지 않는다"는 선언일 뿐, 확장 자체를 하지는 않는다 |
| **Session Manager 플러그인** | 노드 접속용. `terraform output node_ssm_access` 참고 |

---

# 통합 재검증 (2026-09-09, 2차 이후)

"수준 높은 쪽으로 합쳐진 게 맞느냐"는 확인 요청에 따라, 2차 통합에서 **읽지 않고
'내 것 유지'로 넘긴 파일들**을 전부 열어 다시 비교했다. 대상은 찬규 안의
`security.tf` · `vpc.tf` · `cloudfront.tf` · `s3.tf` · `ecr.tf` · `main.tf` ·
`outputs.tf` 였다.

## 내 쪽이 더 낮았던 부분 — 고쳤다

| 문제 | 상태 | 조치 |
| --- | --- | --- |
| **S3 버킷에 버저닝이 없음** | 찬규 안에는 있음 | 가져옴. 잘못된 번들을 올렸을 때 되돌릴 유일한 수단 |
| **S3 저장 암호화(SSE-S3) 없음** | 찬규 안에는 있음 | 가져옴. 비용 0 |
| `force_destroy = true` 무조건 | 찬규는 `var.environment != "prod"` | 찬규 쪽으로 바꿈 |
| `error_caching_min_ttl` 미지정 | 찬규는 10초 | 가져옴. 기본 300초라 배포 직후 잘못된 403/404 가 5분 유지됨 |

## 내 쪽 실수 — 고쳤다

| 문제 | 왜 문제인가 |
| --- | --- |
| **`aws_security_group.nat` 이 고아** | `vpc.tf` 는 NAT **게이트웨이**를 쓰는데 게이트웨이는 보안그룹을 붙일 수 없다. 붙는 곳 없이 만들어지기만 했고, 프라이빗 대역이 하드코딩돼 `vpc_cidr` 을 바꾸면 조용히 어긋났다. **삭제** |
| **`aws_security_group.rds` 에만 `count` 누락** | `rds.tf` 의 다른 리소스는 전부 `count = var.use_rds ? 1 : 0` 인데 SG 만 빠져 있었다. `use_rds = false` 인 지금 붙을 DB 없는 SG 만 남는다. **추가** |
| 1차 README 의 `domain_name = ""` 설명 | 사실이 아니었다. 위 "정정" 절 참고 |

## 양쪽 다 없어서 새로 넣은 것

| 추가 | 왜 |
| --- | --- |
| **S3 게이트웨이 VPC 엔드포인트** | ECR 이미지 레이어는 S3 에서 온다. 엔드포인트가 없으면 전부 NAT 를 지나 GB 당 $0.045. 게이트웨이 엔드포인트는 **요금이 없다** |
| **ALB `drop_invalid_header_fields = true`** | 기본값이 false. 규격을 어긴 헤더가 뒤로 전달되어 ALB 와 앱이 같은 요청을 다르게 해석할 수 있다(AWS FSBP ELB.4). 비용 0 |
| **노드그룹 → vpc-cni/kube-proxy 의존** | 애드온 OVERWRITE 로 CNI DaemonSet 이 재시작되는 중에 노드가 조인하면 파드에 IP 가 안 붙는 구간이 생긴다 |

## 검증한 주장

2차 통합 때 "찬규 안에 없다"고 적은 것들을 실제로 확인했다. **네 개 모두 사실이었다.**

| 주장 | 결과 |
| --- | --- |
| EBS CSI 애드온 없음 | 맞음 |
| EKS Access Entry 없음 | 맞음 |
| IRSA 역할 없음 (OIDC 공급자만 있음) | 맞음 — `sts:AssumeRoleWithWebIdentity` 를 쓰는 역할이 하나도 없다 |
| SQS · DynamoDB 없음 | 맞음 |

VPC 는 두 안이 거의 같았다. 차이는 내 쪽에만 있는 EKS 서브넷 태그
(`kubernetes.io/role/elb`)뿐이고, 이건 예지 안에서 온 것이다.
ECR 은 내 쪽이 저장소 2개(WS · API), 찬규 안은 1개다. `scan_on_push` 와
수명주기 정책은 양쪽 다 있다.

## ⚠️ 아직 양쪽 다 없는 것 — 팀이 정할 것

| 없는 것 | 왜 필요한지 | 비용 |
| --- | --- | --- |
| **VPC Flow Logs** | "누가 어디로 통신했는지" 기록이 아예 없다. 보안 질문에서 자주 나온다 | CloudWatch 수집 $0.50/GB |
| **ALB 액세스 로그** | 어떤 요청이 몇 초 걸렸는지 ALB 관점의 기록이 없다. 부하 테스트 분석에 유용 | S3 저장 비용만 |
| **ECR 인터페이스 엔드포인트** | ECR API 호출이 아직 NAT 를 지난다 | 엔드포인트당 월 약 $15 — 지금 규모에선 NAT 요금보다 비쌀 수 있음 |
| **KMS 고객 관리 키** | 지금은 전부 AWS 관리형 키 | 키당 월 $1 |
| **보안그룹 규칙 `description`** | 찬규 안에는 모든 규칙에 설명이 있고 내 쪽엔 없다. 콘솔에서 읽기 편함 | 없음 |

앞의 둘은 발표에서 지적받기 쉬운 항목이다. 넣기로 하면 알려줄 것.

---

# EKS 공유 구조와 온프레미스 대조 (2026-09-09, 3차 확인)

## 클러스터는 하나를 공유한다

**EKS 클러스터는 1개다.** 사람마다 따로 만들지 않는다. 나누는 단위는
쿠버네티스 네임스페이스이고, 권한은 EKS Access Entry 로 준다.

```
queuing-eks (클러스터 1개 · 워커노드 공유)
├── queuing-a    찬규  ← 편집 가능 (본인만)
├── queuing-b    건아  ← 편집 가능 (본인만)
├── realtime     지예  ← 편집 가능 (본인만)
├── queuing-d    예지  ┐
├── monitoring   예지  ├ 편집 가능 (본인만)
├── redis        예지  ┘
└── argocd       지예(인프라)
```

| 범위 | 정책 | 의미 |
| --- | --- | --- |
| 자기 네임스페이스 | `AmazonEKSEditPolicy` | 배포·수정·삭제 가능. **그 안의 Secret 도 읽고 쓴다** |
| 클러스터 전체 | `AmazonEKSViewPolicy` | 조회만. **Secret 은 목록에 없어 못 읽는다** |

즉 남의 파트는 "보이지만 못 건드린다". 온프레미스에서 예지님 ClusterRole 에서
`secrets` 를 뺀 것과 같은 수준이다(`shared-infra/yeji-rbac.yaml`).
근거: https://docs.aws.amazon.com/eks/latest/userguide/access-policy-permissions.html

### 🔴 네임스페이스 이름이 어긋나 있었다 — 고쳤다

`queuing-${part}` 로 유추하고 있었는데 실제 클러스터와 달랐다.

| 파트 | 실제 (깃 매니페스트 기준) | 고치기 전 | 결과 |
| --- | --- | --- | --- |
| A 찬규 | `queuing-a` | `queuing-a` | 일치 |
| B 건아 | 매니페스트에 없음 (릴리즈 시 결정) | `queuing-b` | **확인 필요** |
| C 지예 | **`realtime`** | `queuing-c` | 권한 안 생김 |
| D 예지 | **`monitoring` · `redis` · `queuing-d`** | `queuing-d` 만 | 둘이 빠짐 |

`team_members` 에 `namespaces` 를 직접 적는 방식으로 바꿨다.

**AWS 는 네임스페이스 이름의 철자나 존재를 검증하지 않는다.**
"Amazon EKS doesn't confirm the spelling or existence of the namespaces on your
cluster." — 즉 틀려도 `apply` 는 성공하고 권한만 조용히 안 생긴다. 그래서
배포 후 각자 확인해야 한다.

```bash
kubectl auth can-i create deployment -n <자기 네임스페이스>   # yes
kubectl auth can-i create deployment -n <남의 네임스페이스>   # no
kubectl auth can-i get secrets -A                            # no
```

## 온프레미스 설정과 대조

| 항목 | 온프레미스 (실측) | terraform-final | 판정 |
| --- | --- | --- | --- |
| C파트 NodePort | 30081 | 30081 | 일치 |
| A파트 NodePort | 30084 | 30084 | 일치 |
| C파트 헬스체크 | `/healthz` (livenessProbe) | `/healthz` | 일치 |
| A파트 헬스체크 | `/health` | **`/events` → `/health` 로 고침** | 아래 참고 |
| CPU 총량 | 2 vCPU × 2대 = 4 | t3.medium 2 vCPU × 2 = 4 | 일치 |
| 메모리 총량 | 7.2Gi × 2 = **14.4Gi** | 4.0Gi × 2 = **8.0Gi** | **-44%** |
| K8s 버전 | 1.31.14 | 1.34 | 의도적 (요금) |
| Redis | 8.10.1 (bitnami) | ElastiCache 7.1 | 확인 완료 |
| Redis 비밀번호 | 없음 (realtime 공용) | 없음 (VPC 내부) | 동일 |
| keyspace notification | 앱이 `CONFIG SET` | 파라미터 그룹 `Ex` | ElastiCache 는 이 방법뿐 |
| Helm · HPA · KEDA · ArgoCD | — | 수정 없이 그대로 | 일치 |

### 🔴 A파트 헬스체크가 `/events` 였다 — 고쳤다

근거 없이 들어간 값이었다. `/events` 는 DB 와 Redis 를 모두 타는 업무
엔드포인트인데, 헬스체크 `timeout` 은 5초다. 온프레미스 부하 테스트에서 A파트
조회 계열이 11초까지 늘어졌으므로, **부하가 몰리는 순간 헬스체크가 먼저
타임아웃하고 ALB 가 노드를 타겟그룹에서 빼버린다.** 트래픽이 가장 많을 때
받을 노드가 사라진다. 티켓 오픈 직후에 정확히 이 형태로 무너진다.

`/health` 로 바꾸고 변수(`health_check_path_api`)로 뺐다.

다만 **A파트 `/health` 는 Redis 연결을 확인하지 않는다.** 9/5 Redis 장애 때
`/health` 는 200 인데 `/events` 는 500 이었다. 찬규님께 `/health` 에 Redis ping
을 추가해달라고 요청해둔 상태다.

### 메모리가 줄어드는 것에 대해

CPU 총량은 같고, T3 는 기본이 `unlimited` 모드라 베이스라인(vCPU당 20%)을
넘겨도 **스로틀링되지 않는다** — 5분짜리 부하 테스트는 영향이 없다.

문제는 메모리다. 파드 requests 자체는 작다(파트별 128Mi). 무거운 쪽은 같이
얹히는 것들이다 — kube-prometheus-stack, ArgoCD, KEDA, metrics-server.
온프레미스에서 이것들이 7.2Gi × 2 위에 있었다.

`eks_node_max_size` 를 4 → **6** 으로 올렸다. 모자라면 Cluster Autoscaler 가
노드를 늘리고, 늘어난 만큼만 요금이 붙는다. 그래도 부족하면 `t3.large`
(8Gi, 월 $120)로 올린다. 먼저 띄워보고 판단하는 쪽이 낭비가 없다.

```bash
kubectl get pods -A | grep Pending
kubectl describe node | grep -A6 "Allocated resources"
```

### Redis 8.10.1 → 7.1 은 확인했다

ElastiCache 의 `engine = "redis"` 는 **7.1 이 최대**다. Redis 8 은 없고 AWS 는
그 위를 Valkey(8.x, 9.x)로 제공한다.

우리 코드가 쓰는 명령어를 전부 뽑아 확인했다.

- C파트: `lrange` `rpush` `ltrim` `expire` `publish` `subscribe` `psubscribe` `get` `set` `sadd` `smembers` `hgetall` `pipeline/exec`
- A파트: `eval` `hgetall` `hincrby` `hset` `scan` `zadd` `zrange` `pipeline`

전부 7.1 이하에서 지원된다. 7.4 이상 전용(`HEXPIRE`, `SINTERCARD`, Functions)이나
8 전용 명령은 쓰지 않는다.

## 이번에 고친 것 정리

| 고친 것 | 어떤 문제였나 |
| --- | --- |
| `local.zone_id` 의 `[0]` 인덱스 | Terraform 삼항은 **양쪽 branch 를 모두 평가한다.** `create_route53_zone = false`(지금 설정)면 빈 목록에 `[0]` 을 걸어 plan 이 실패한다. `one()` 으로 교체 |
| `route53_nameservers` 출력 | 같은 문제. 스플랫 + `flatten` 으로 교체 |
| `rds_endpoint` 출력 | 같은 문제. `use_rds = false`(지금 기본값)에서 걸린다. 스플랫 + `join` 으로 교체 |
| `web_acl_id` | 같은 문제. 내가 이번에 넣은 것. `waf_enabled = false` 에서 걸린다 |
| A파트 헬스체크 `/events` | 위 참고 |
| Access Entry 네임스페이스 | 위 참고 |
| `eks_node_max_size` 4 → 6 | 메모리 여유 |

근거: https://developer.hashicorp.com/terraform/language/expressions/conditionals

## 추가한 것

| 추가 | 내용 |
| --- | --- |
| **VPC Flow Logs** (`flow_logs.tf`) | CloudWatch, 보관 7일, 60초 집계. IAM 신뢰 정책에 `aws:SourceAccount` 조건(혼동된 대리인 방지) 포함. `flow_logs_traffic_type` 으로 `REJECT` 만 받게 줄일 수 있다 |
| **보안그룹 규칙 `description`** | 모든 SG 와 모든 규칙에 설명. 찬규 안의 방식. ⚠️ description 은 나중에 수정할 수 없고 규칙을 지웠다 다시 만들어야 한다 |
