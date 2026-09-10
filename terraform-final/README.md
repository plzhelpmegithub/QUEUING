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

---

# IAM 정리 (2026-09-09, 4차)

지예님이 IAM 사용자를 **콘솔에서 직접 만들어 팀원들에게 전달하고 PowerUserAccess 를
부여한 상태**라는 것이 확인되어, 테라폼이 계정을 또 만들지 않도록 껐다.

## 껐을 때 무엇이 사라지나

| 변수 | 기본값 | 껐을 때 만들지 않는 것 |
| --- | --- | --- |
| `create_team_iam_users` | `false` | 팀원 IAM 사용자 4명, 액세스 키 4개, 콘솔 비밀번호 4개, 그룹·공통정책 |
| `create_ses_smtp_user` | `false` | SES SMTP 전용 사용자와 액세스 키 |

**기본값으로 `apply` 하면 IAM 사용자와 액세스 키가 0개 생성된다.**
남는 IAM 리소스는 역할(Role)과 정책뿐이고, 그것들은 파드·노드·서비스가 쓴다
(IRSA, 노드 역할, Flow Logs 역할 등). 사람이 쓰는 자격증명은 하나도 만들지 않는다.

## 왜 켜두면 해로운가

`iam_team.tf` 는 사용자 이름을 `team_members` 의 `username` 그대로 만든다
(`jiye-c`, `chankyu-a`, `geona-b`, `yeji-d`).

- 같은 이름이 이미 있으면 `apply` 가 **`EntityAlreadyExists` 로 실패**한다.
- 이름이 다르면 **중복 사용자 4명**이 더 생긴다.
- 액세스 키와 콘솔 비밀번호가 **`tfstate` 에 평문으로** 기록된다.

파일은 지우지 않고 남겼다. 나중에 계정을 테라폼으로 관리하기로 하면
`create_team_iam_users = true` 한 줄로 되돌릴 수 있다. 그때는 콘솔에서 만든
사용자를 먼저 지우거나 `terraform import` 해야 한다.

## EKS 접근 권한은 그대로 유지한다

**PowerUserAccess 는 AWS API 권한이고, 쿠버네티스 RBAC 는 완전히 별개다.**
`authentication_mode = "API"` 이므로 클러스터의 K8s API 에 붙으려면 Access Entry 가
있어야 한다. PowerUser 만 있는 팀원은 `aws eks update-kubeconfig` 는 되지만
`kubectl get pods` 는 거부된다.

그래서 `eks_access.tf` 는 그대로 둔다. 다만 이제 테라폼이 사용자를 만들지 않으므로,
principal ARN 을 **계정 ID + 사용자 이름으로 조립**한다.

```hcl
"arn:aws:iam::${data.aws_caller_identity.current.account_id}:user/${m.username}"
```

⚠️ **`team_members` 의 `username` 이 실제 IAM 사용자 이름과 정확히 같아야 한다.**
다르면 존재하지 않는 사용자에게 권한을 주는 셈이 된다. 확인:

```bash
aws iam list-users --query 'Users[].UserName' --output table
```

## ⚠️ PowerUserAccess 의 범위에 대해

참고로 적어둔다. `PowerUserAccess` 는 IAM·Organizations·Account 를 제외한
**거의 모든 AWS 동작을 허용**한다. 여기에는 `eks:CreateAccessEntry` 와
`eks:AssociateAccessPolicy` 도 포함된다.

즉 팀원이 스스로에게 `AmazonEKSClusterAdminPolicy` 를 붙일 수 있고, 클러스터·RDS·
ElastiCache 를 삭제할 수도 있고, Secrets Manager 값을 읽을 수도 있다.

`eks_access.tf` 의 네임스페이스 분리는 **실수를 막는 가드레일**로는 유효하지만,
PowerUser 가 함께 있는 한 **의도적인 우회를 막지는 못한다.** 4명이 서로 신뢰하는
팀이라면 지금 구성으로 충분하고, 더 좁히려면 PowerUserAccess 대신 필요한 서비스만
허용하는 정책으로 바꿔야 한다 — 그건 별도 작업이다.

---

# CI/CD (2026-09-09, 5차)

## 결정

| | 어디서 | 왜 |
| --- | --- | --- |
| **Jenkins** | 별도 EC2 (`jenkins.tf`) | 파드 안에서는 `docker build` 가 안 된다. Kaniko 로 Jenkinsfile 을 다시 쓰는 대신 지금 구조를 유지한다. 노드 메모리도 총 8Gi 라 여유가 없다 |
| **ArgoCD** | EKS 안 (`argocd` 네임스페이스) | 쿠버네티스 워크로드라 그대로 옮겨간다. Helm 으로 설치 |

## 액세스 키를 만들지 않는다

| 무엇이 | 어떻게 인증하나 |
| --- | --- |
| Jenkins → ECR push | **EC2 인스턴스 프로파일** (`aws_iam_instance_profile.jenkins`) |
| ArgoCD Image Updater → ECR 태그 조회 | **IRSA** (`aws_iam_role.argocd_image_updater`) |
| 노드 → ECR pull | 노드 역할의 `AmazonEC2ContainerRegistryReadOnly` |

ECR 토큰은 12시간마다 만료된다. Secret 에 한 번 넣어두는 방식은 반나절 뒤
조용히 멈춘다 — "왜 새 이미지를 안 잡지" 하고 헤매게 되는 종류의 고장이다.
위 세 가지는 모두 SDK 가 토큰을 자동 갱신한다.

## ECR 저장소 — 2개에서 4개로

네 파트 전부 젠킨스로 빌드하는데 저장소가 2개뿐이었다.

| 파트 | 지금 (Docker Hub) | ECR |
| --- | --- | --- |
| A 찬규 | `mover14/redis-api-backend` | `queuing/api-server` |
| B 건아 | `dororonge/queuing-worker` | `queuing/worker` |
| C 지예 | `chlwldp/realtime-ws` | `queuing/realtime-ws` |
| D 예지 | `ttomang/backend-counter` | `queuing/counter` |

각 파트가 자기 `values.yaml` 의 `image.repository` 를 바꿔야 한다.

```bash
terraform output ecr_repositories
```

## Jenkins 쪽에서 바뀌는 것

Jenkinsfile 에서 실질적으로 바뀌는 건 로그인 한 줄이다.

```bash
# 지금 (Docker Hub)
docker login -u <계정> -p <토큰>

# AWS (ECR) — 인스턴스 프로파일을 자동으로 집어간다. 키를 넣지 않는다.
aws ecr get-login-password --region ap-northeast-2 | docker login \
  --username AWS --password-stdin <계정ID>.dkr.ecr.ap-northeast-2.amazonaws.com
```

```bash
terraform output ecr_login_command   # 완성된 명령
terraform output jenkins_url         # 접속 주소 + 최초 비밀번호 확인법
```

⚠️ **Jenkins EC2 에는 SSH 를 열지 않았다.** 22번 포트가 없고 키 페어도 지정하지
않았다. 접속은 SSM 으로 한다.

```bash
aws ssm start-session --target <인스턴스ID>
```

⚠️ **`jenkins_allowed_cidr` 기본값이 `0.0.0.0/0` 이다.** 최초 설정을 마치기 전까지
젠킨스는 비밀번호가 없는 상태다. 사무실 공인 IP 로 좁힐 것.

## ArgoCD Image Updater 연결

```bash
kubectl -n argocd annotate serviceaccount argocd-image-updater \
  eks.amazonaws.com/role-arn=$(terraform output -raw argocd_image_updater_role_arn)
kubectl -n argocd rollout restart deployment argocd-image-updater
```

⚠️ ServiceAccount 이름이 `argocd-image-updater` 라고 가정하고 신뢰 정책을 썼다
(Helm 차트 기본값). 다르게 깔았으면 `irsa.tf` 의 `sub` 조건을 실제 이름으로
바꿔야 한다. 이름이 틀리면 역할을 맡지 못하고, 이때도 조용히 실패한다.

Application 어노테이션의 이미지 주소도 ECR 로 바꾼다.

```yaml
argocd-image-updater.argoproj.io/image-list: ws=<ECR주소>/queuing/realtime-ws
```

---

# 6차 — validate 통과와 반복 배포 대응 (2026-09-09)

## terraform validate 가 잡아낸 것

**보안그룹 `description` 은 ASCII 만 받는다.**

```
Error: "ingress.0.description" doesn't comply with restrictions
       ("^[0-9A-Za-z_ .:/()#,@\[\]+=&;{}!$*-]*$")
```

5차에서 찬규 안을 따라 모든 SG 규칙에 `description` 을 붙였는데, 한글로 썼다.
허용 문자 집합에 한글이 없다.

`validate` 는 4건만 보여줬지만 실제로는 **19건**이었다. AWS 로 전송되는 문자열
전체를 훑어서 전부 영문으로 바꿨다. 한글 설명은 `#` 주석에 남겼다 —
주석은 AWS 로 가지 않는다.

| 파일 | 건수 |
| --- | --- |
| `security_groups.tf` | 12 |
| `jenkins.tf` | 3 |
| `secrets.tf` | 2 |
| `ecr.tf` · `waf.tf` | 각 1 |

## ⚠️ validate 가 **못** 잡는 것도 있었다

`ecr.tf` 의 `Desc` 태그 값에 괄호와 em 대시를 썼다.

```
"A 찬규 — 예매 API (기존 mover14/redis-api-backend)"
```

AWS 태그 값 허용 문자는 **글자·숫자·공백과 `_ . : / = + - @`** 뿐이다.
괄호 `(` `)` 와 em 대시 `—` 는 들어가지 않는다. (한글 자체는 글자라서 허용된다.)

이건 스키마 위반이 아니라 **AWS API 가 거부**하는 것이라 `validate` 를 통과하고
`apply` 도중에 실패한다. EKS 생성에 15분이 걸리므로 한참 뒤에 터진다.

**교훈: `validate` 통과가 apply 성공을 뜻하지 않는다.**

## plan 이 db_password 를 물어보던 문제

`use_rds = false` 라 RDS 를 만들지 않는데도 비밀번호를 물었다.
`secrets.tf` 의 삼항 연산자가 양쪽 branch 를 모두 평가하기 때문이다.

기본값을 `""` 로 주고, 대신 `rds.tf` 에 `precondition` 을 넣어
`use_rds = true` 인데 비어 있으면 apply 전에 명확히 막도록 했다.

## apply / destroy 를 반복할 때

비용 때문에 하루에도 여러 번 켰다 끄기로 했다. 그 방식에서 걸리는 것 셋을 고쳤다.

### 🔴 두 번째 apply 가 반드시 실패하던 문제

`aws_secretsmanager_secret` 의 `recovery_window_in_days = 7` 이었다.
`destroy` 는 시크릿을 실제로 지우지 않고 "7일 뒤 삭제 예정"으로만 표시한다.
그 상태로 다시 apply 하면 같은 이름을 만들 수 없다.

```
InvalidRequestException: You can not create this secret because
a secret with this name is already scheduled for deletion.
```

`environment` 가 `prod` 가 아니면 `0`(즉시 삭제)이 되게 바꿨다.

### 🔴 NAT 공인 IP 가 매번 바뀌던 문제

`use_rds = false` 라 A파트가 외부 D-Cloud MariaDB 에 붙는다. D-Cloud 는 출발지
IP 로 접근을 허용하므로, NAT 의 EIP 가 화이트리스트에 등록되어 있어야 한다.

`destroy` 하면 EIP 가 반납되고 다시 apply 하면 새 주소를 받는다.
**apply 할 때마다 D-Cloud 관리자에게 재등록을 요청해야 한다** — 하루에 여러 번
반복하는 방식에서는 불가능하다.

`nat_eip_allocation_id` 변수를 추가했다. 값을 넣으면 기존 EIP 를 재사용하고
새로 만들지 않는다.

```bash
# 1) 현재 EIP 의 할당 ID 확인
terraform state show aws_eip.nat

# 2) 테라폼 관리에서만 떼어낸다 (AWS 에서는 지워지지 않는다)
terraform state rm aws_eip.nat

# 3) terraform.tfvars 에 넣는다
#    nat_eip_allocation_id = "eipalloc-xxxxxxxx"
```

⚠️ **destroy 전에 해야 한다.** destroy 후에는 EIP 가 이미 반납된 뒤다.

붙어 있지 않은 EIP 는 시간당 $0.005(월 약 $3.6)다. 재등록 수고에 비하면 싸다.

`nat_eip` 출력은 `aws_eip.nat` 이 아니라 `aws_nat_gateway.main.public_ip` 를
읽도록 바꿨다. 두 경우 모두에서 실제 나가는 주소를 준다.

### ⚠️ Jenkins 고아 볼륨

`delete_on_termination = false` 였다. destroy 후 볼륨이 남지만, 다시 apply 해도
테라폼이 그 볼륨을 새 인스턴스에 붙여주지 않는다. 결과적으로 젠킨스 설정은
어차피 사라지고 요금만 내는 볼륨이 apply 마다 하나씩 쌓인다. `true` 로 바꿨다.

젠킨스 설정을 유지하려면 apply/destroy 대상에서 빼는 편이 낫다.
`jenkins_enabled = false` 로 두고 젠킨스만 계속 켜두거나, JCasC 로 설정을
깃에 넣는다.

## 절약액

| 항목 | 시간당 |
| --- | --- |
| EKS 컨트롤플레인 | $0.10 |
| 워커노드 t3.medium ×2 | $0.083 |
| NAT 게이트웨이 | $0.045 |
| ElastiCache ×2 | $0.034 |
| ALB | $0.023 |
| **합계** | **약 $0.29** |

하루 8시간만 켜면 월 $256 → 약 $75.

**destroy 해도 남는 비용**: 호스팅 영역 $0.50/월, NAT EIP $3.6/월,
ECR·S3 저장 몇 센트. 합쳐서 월 $5 정도.

**시간 비용**: apply 20~30분, destroy 15~20분. 대부분 EKS 클러스터
생성·삭제 시간이라 줄일 방법이 없다.

## 검사 스크립트

`terraform validate` 로 잡히지 않는 것들을 위해 다음을 확인했다.
같은 종류의 실수가 반복되면 스크립트로 만들어 둘 것.

- AWS 로 전송되는 `description` / `comment` 의 비 ASCII
- 보안그룹 description 허용 문자셋과 255자 제한
- 태그 값 문자셋 (`local` 참조까지 따라감)
- 삼항 연산자 안의 `[0]` 인덱스 (양쪽 branch 가 모두 평가된다)
- `count` 가 붙은 리소스를 `[0]` 없이 참조하는 곳
- heredoc 안의 `${...}` 가 의도치 않게 보간되는 곳
- 정의됐지만 아무데서도 참조되지 않는 리소스

---

# 프론트엔드 배포 (2026-09-09, 찬규님 문의)

## 테라폼은 파일을 올리지 않는다

`aws_s3_bucket.frontend` 와 CloudFront 는 만들지만, **빌드 산출물을 올리는
리소스는 없다.** 의도한 것이다.

| 테라폼에 넣으면 | |
| --- | --- |
| 상태 추적 | 올린 파일 하나하나가 상태에 들어간다. 빌드마다 해시가 바뀌어 `plan` 이 매번 수백 개 변경으로 뜬다 |
| destroy 결합 | **`terraform destroy` 가 웹사이트 파일까지 지운다.** 하루에 여러 번 destroy 하는 지금 방식과 정면으로 충돌한다 |
| 권한 결합 | 프론트 배포는 하루 여러 번, 인프라 변경은 가끔이다. 묶으면 배포마다 인프라 권한이 필요해진다 |
| 캐시 무효화 | 테라폼으로 CloudFront invalidation 을 다룰 방법이 마땅치 않다 (`null_resource` + `local-exec` 은 상태 추적이 안 된다) |

## 그러면 손으로 하나 — 아니다

백엔드 4개가 이미 젠킨스로 간다. 프론트만 손으로 하면 누가 언제 무엇을
올렸는지 기록이 남지 않는다. **젠킨스 잡으로 한다.**

테라폼이 해주는 것은 **권한과 주소**까지다.

```bash
terraform output frontend_deploy_guide
```

## 젠킨스에 붙은 권한 (`jenkins.tf`)

`aws_iam_role_policy.jenkins_frontend` 를 추가했다. 이게 없으면 젠킨스가
S3 에 쓸 수도, 캐시를 무효화할 수도 없다.

| 대상 | 허용 |
| --- | --- |
| S3 버킷 (이 버킷만) | `ListBucket` `GetObject` `PutObject` `DeleteObject` |
| CloudFront (이 배포만) | `CreateInvalidation` `GetInvalidation` `ListInvalidations` |

인스턴스 프로파일이라 **액세스 키를 넣지 않는다.**

## 캐시를 두 갈래로 나눈다

CloudFront `default_ttl` 이 3600초다. 캐시 헤더 없이 그냥 올리면 새 파일을
올려도 **최대 1시간 동안 옛 화면**이 보인다.

```bash
# 1) 해시 붙은 자산 — 1년 캐시. 파일명이 매번 바뀌므로 무효화가 필요 없다
aws s3 sync ./dist s3://<버킷> --delete --exclude "index.html" \
  --cache-control "public,max-age=31536000,immutable"

# 2) index.html — 캐시하지 않는다. 이 파일이 새 자산을 가리킨다
aws s3 cp ./dist/index.html s3://<버킷>/index.html \
  --cache-control "no-cache,no-store,must-revalidate" --content-type "text/html"

# 3) index.html 만 무효화
aws cloudfront create-invalidation --distribution-id <배포ID> --paths "/index.html"
```

⚠️ **`/*` 로 전체 무효화하지 말 것.** 월 1,000건까지 무료이고 그 뒤로는
경로당 $0.005 다. 배포마다 전체를 무효화하면 금방 넘긴다. 위처럼 나누면
배포당 1건만 쓴다.

⚠️ `./dist` 는 Vite 기준이다. CRA 면 `./build`.

## 프론트엔드에서 바꿔야 할 주소

```
API : https://api.queuing.kr
WS  : wss://api.queuing.kr/ws
```

WebSocket 은 CloudFront 를 거치지 않고 ALB 로 직접 간다.

---

# 7차 — 실제 배포에서 배운 것 (2026-09-09)

인프라 113개를 만들고 프론트엔드와 C파트를 AWS 에서 띄우면서 드러난 것들이다.
문서보다 실제 배포가 정확했던 항목이 여럿이라, 근거를 바로잡아 기록한다.

## 🔴 내가 틀렸던 것 — D-Cloud 화이트리스트

**"NAT EIP 를 D-Cloud 화이트리스트에 등록해야 한다"는 사실이 아니었다.**

EKS 파드에서 직접 붙어 확인한 결과다.

```
CURRENT_USER() = team2@%
GRANT ALL PRIVILEGES ON *.* TO `team2`@`%`
```

호스트가 `%` 라 어느 IP 에서든 접속된다. 등록 절차 자체가 없었다.
이전 세션에서 `'team2'@'118.131.22.85'` 형태를 봤다는 기록을 근거로 IP 에
묶여 있다고 단정했는데, **검증하지 않은 추론이었다.** 그 잘못된 전제가
`outputs.tf`, `vpc.tf`, `variables.tf`, README 여러 곳에 퍼져 있었다.

전부 정정했다. `dcloud_whitelist_guide` 출력은 `dcloud_db_access` 로 바꿨다.

### 대신 진짜 문제가 드러났다

`team2@%` 에 `ON *.*` 전권이다. 즉 `211.46.52.164:13306` 에 네트워크로 닿는
사람이면 누구나 비밀번호만 알면 모든 DB 에 전권으로 들어온다. 화이트리스트가
없는 게 아니라 **애초에 열려 있었다.** MySQL 프로토콜은 평문이고 인증서가
자체 서명이라 클라이언트가 `--skip-ssl` 로 검증을 끄고 붙는다.

완화 방법은 세 가지다. `use_rds = true` 로 RDS 이전(월 약 $15, 문제가 통째로
사라짐) / `team2@%` 를 좁히기(D-Cloud 관리자 권한 필요) / 최소한 비밀번호 교체.
발표에서 접근 통제 질문이 나오면 정직하게 답해야 하는 부분이다.

## 🔴 CloudFront — apply 를 중단시킨 것

`forwarded_values.headers` 에 `Upgrade` 를 넣어 배포 생성이 실패했다.

```
InvalidArgument: The parameter Header Name with value Upgrade is not allowed.
```

공식 헤더 표에서 `Upgrade` 는 "Caching based on header values is supported: No" 다.
CloudFront 가 WebSocket 업그레이드를 직접 처리하므로 화이트리스트에 넣을 수 없고,
넣을 필요도 없다. `Sec-WebSocket-*` 는 허용된다.

## 🔴 CloudFront — 경로가 절반 빠져 있었다

프론트가 API 를 상대경로로 호출하는데(`fetch("/membership/subscribe")`),
개발 중에는 Vite 프록시가 넘겨주지만 S3+CloudFront 에는 프록시가 없다.
Behavior 에 없는 경로는 S3 로 떨어지고, 파일이 없어 403 → `custom_error_response`
로 **`index.html` 이 200 으로** 돌아온다. API 가 JSON 대신 HTML 을 200 으로 받아서
"파싱 실패"로만 보인다. 404 였다면 금방 알았을 것이다.

두 사람이 각자 다른 출처를 봤고 **양쪽 다 반쪽이었다.**

| 출처 | 놓친 것 |
| --- | --- |
| 지예 — `src/` 의 fetch 호출 | `/sse` `/cancel-queue` `/health` (EventSource 라 정규식에 안 걸림) |
| 찬규 — `vite.config.js` proxy | `/api` `/actuator` `/prom-api` |

합집합 17개 + `/ws` 2개 + 기본 1개 = 20개. CloudFront 한도는 25개다.

⚠️ `/queue*` 는 `/cancel-queue` 를 잡지 못한다. 경로 패턴은 앞에서부터 맞춘다.

## 🔴 ElastiCache — A파트가 뜨지 못한 원인

```
ReplyError: ERR unknown command 'config', with args beginning with:
            'SET' 'notify-keyspace-events' 'Ex'
```

앱이 `CONFIG SET` 을 직접 호출하는데 ElastiCache 가 그 명령을 차단한다.
`src/app.js:81` 에서 `start()` 의 첫 줄이라 프로세스가 그대로 죽는다.
**DB 접속 코드(82줄)까지 도달조차 못 한다** — "DB 연결이 안 된다"로 보이지만
시도조차 못 하고 있는 것이다.

파라미터 그룹은 원래 의도대로 동작하고 있었다. 앱에서 그 호출을 `try/catch` 로
감싸면 된다. 이 파라미터 그룹은 "있으면 좋은 것"이 아니라 **없으면 A파트가
아예 뜨지 못하는 필수 요소**다.

## 🔴 빠져 있던 권한 — SNS

A파트 `src/services/notificationService.js` 가 SES 뿐 아니라 SNS 도 쓴다.

```js
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
await snsClient.send(new PublishCommand({ ... }))
```

`aws_iam_role.ses_send` 에는 `ses:*` 만 있어서 알림을 보내는 순간
`AccessDenied` 가 났을 것이다. `sns:Publish` 등을 추가했다.

⚠️ 토픽은 아직 만들지 않았다. 앱이 쓰는 `TopicArn` 이 환경변수에도 없어
확인이 필요하다. 정해지면 `aws_sns_topic` 을 추가하고 Resource 를 좁힐 것.

## ⚠️ 네임스페이스를 먼저 만들면 helm 이 실패한다

일부 차트가 `templates/namespace.yaml` 로 네임스페이스를 직접 만든다.
`kubectl create namespace` 로 미리 만들어두면 helm 이 소유권 메타데이터가
없다며 거부한다. 라벨·어노테이션으로 인수시키면 된다 (`eks_access.tf` 주석 참고).

## ⚠️ Secret 키 이름은 차트마다 다르다

A파트는 `mariadb-credentials` 의 **`MARIADB_ROOT_PASSWORD`** 를 참조한다.
`password` 로 만들면 환경변수가 조용히 비고, 원인을 찾기 어렵다.
차트를 배포하기 전에 반드시 확인할 것.

```bash
kubectl -n queuing-a get deploy api -o jsonpath='{.spec.template.spec.containers[0].env}'
```

## ⚠️ Helm values 키 경로를 확인하고 --set 할 것

C파트는 `config.redisHost` 가 아니라 **`env.redisHost`** 다. 틀린 키로 `--set`
하면 helm 이 새 키를 만들고 실제 값은 기본값(온프레미스 주소) 그대로 남는다.
**에러 없이 조용히 틀리는** 종류라 배포 후 반드시 주입된 값을 확인해야 한다.

```bash
kubectl -n realtime get deploy realtime-ws -o jsonpath='{.spec.template.spec.containers[0].env}'
```

## 각 파트가 AWS 로 가려면 코드/차트 수정이 필요하다

온프레미스 전용 설정이 `--set` 으로 못 넘기는 자리에 박혀 있다.

| 파트 | 무엇이 박혀 있나 | 누가 고쳐야 하나 |
| --- | --- | --- |
| A 찬규 | `timerService.js:44` 의 `CONFIG SET` | 찬규 (코드) |
| B 건아 | 템플릿에 LocalStack 주소와 더미 키(`test/test`) 하드코딩 | 건아 (차트) |
| C 지예 | 없음 — `--set env.redisHost` 로 해결 | — |
| D 예지 | 차트가 자체 Redis 포함. nodePort 30083 은 ALB 타겟그룹 없음 | 확인 필요 |

## 배포 성공 상태 (2026-09-09 기준)

| | |
| --- | --- |
| 프론트엔드 S3 + CloudFront | ✅ `https://queuing.kr` |
| C파트 WebSocket | ✅ `https://api.queuing.kr/healthz` → 200, `/rooms` → `[]` |
| ElastiCache 연결 | ✅ `[Redis] Connected`, 채널 구독까지 |
| D-Cloud DB 접속 | ✅ EKS 에서 `SELECT 1` 성공 |
| A파트 | ❌ 찬규님 코드 수정 대기 |
| B·D파트 | ❌ 미배포 |

---

# destroy 후 다시 apply 할 때 막히는 것들

같은 이름의 리소스가 AWS 에 남아 있는데 상태 파일에는 없으면 apply 가 실패한다.
destroy/apply 를 반복하는 지금 방식에서 실제로 겪은 것들이다.

## CloudWatch 로그 그룹 (2026-09-09 발생)

```
ResourceAlreadyExistsException: The specified log group already exists
  with aws_cloudwatch_log_group.flow_logs[0]
```

테라폼이 destroy 때 지우지만, VPC Flow Logs 서비스가 마지막 배치를 쓰면서
같은 이름으로 다시 만들어버린다. 로그 그룹은 쓰는 쪽이 있으면 자동 생성된다.

```bash
aws logs delete-log-group --log-group-name /aws/vpc-flow-logs/queuing
terraform apply     # 나머지는 이어서 만들어진다
```

**예방** — destroy 할 때 Flow Log 를 먼저 지운다.

```bash
terraform destroy -target=aws_flow_log.vpc
terraform destroy
```

## Secrets Manager

`recovery_window_in_days` 가 0 이 아니면 destroy 가 실제로 지우지 않고
"삭제 예정"으로만 표시한다. 같은 이름을 다시 만들 수 없다.

```bash
aws secretsmanager describe-secret --secret-id queuing/api-secrets --query "[Name,DeletedDate]"
aws secretsmanager delete-secret --secret-id queuing/api-secrets --force-delete-without-recovery
```

dev 에서는 `environment != "prod"` 조건으로 0 이 되도록 해뒀다.

## apply 전 점검

```bash
aws logs describe-log-groups --log-group-name-prefix /aws/vpc-flow-logs --query "logGroups[].logGroupName"
aws logs describe-log-groups --log-group-name-prefix /aws/eks/queuing-eks --query "logGroups[].logGroupName"
aws logs describe-log-groups --log-group-name-prefix /eks/queuing --query "logGroups[].logGroupName"
aws secretsmanager describe-secret --secret-id queuing/api-secrets --query "[Name,DeletedDate]"
aws ec2 describe-addresses --allocation-ids <nat_eip_allocation_id> --query "Addresses[].PublicIp"
```

앞 네 개는 비어 있어야 하고, 마지막 EIP 는 나와야 한다
(`nat_eip_allocation_id` 로 재사용하기 때문이다).

## 이어서 apply 해도 된다

실패해도 성공한 리소스는 상태에 기록되어 있다. 원인을 고치고
`terraform apply` 를 다시 실행하면 이미 만들어진 것은 건너뛴다.
`terraform destroy` 로 처음부터 다시 할 필요가 없다.
