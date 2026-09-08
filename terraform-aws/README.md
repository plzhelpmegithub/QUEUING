# terraform-aws — AWS 이관용 인프라 (C파트/인프라 담당)

온프레미스 kubeadm 클러스터를 AWS 관리형으로 옮기기 위한 전체 스택.

## ⚠️ 다른 파트 테라폼과 폴더를 나눈 이유

테라폼은 **같은 디렉터리의 `.tf` 파일을 전부 하나로 합쳐서** 읽는다.
하위 폴더는 읽지 않는다. 그래서 폴더만 분리하면 서로 충돌하지 않는다.

| 위치 | 담당 | 내용 |
| --- | --- | --- |
| `main.tf` (리포 루트) | 건아(B) | LocalStack SQS · aws provider `~> 4.0` |
| `terraform/` | 예지(D) | kubernetes · helm provider |
| `terraform-aws/` | 지예(C·인프라) | 실제 AWS 전체 스택 · aws provider `~> 5.0` |

같은 폴더에 넣으면 `provider "aws"` 가 중복되고 프로바이더 버전도 충돌해서
`Duplicate provider configuration` 으로 apply 자체가 안 된다.

**다른 파트 리소스를 여기에 추가할 때도 같은 원칙을 따른다** — 이 폴더에
파일을 추가하는 것은 괜찮지만, `terraform {}` 블록이나 `provider "aws"`,
`variable "project"` 같은 공통 선언은 이미 있으므로 다시 넣지 않는다.

## 구성

| 파일 | 내용 |
| --- | --- |
| `main.tf` | 프로바이더 (서울 + CloudFront 인증서용 us-east-1) |
| `vpc.tf` | VPC · 퍼블릭/프라이빗 서브넷 · 라우팅 |
| `nat_instance.tf` | 프라이빗 서브넷의 유일한 아웃바운드 경로 |
| `eks.tf` | EKS 클러스터 · 노드그룹 · EBS CSI 애드온 |
| `eks_access.tf` | 팀원별 네임스페이스 권한 (Access Entry) |
| `alb.tf` | ALB · 타겟그룹 · HTTPS 리스너 |
| `dns_acm.tf` | queuing.kr Route 53 · ACM 인증서 2장 |
| `s3_cloudfront.tf` | 프론트엔드 정적 호스팅 |
| `elasticache.tf` | 공용 Redis (좌석 · 대기열 · 채팅) |
| `ecr.tf` | 컨테이너 이미지 저장소 |
| `dcloud.tf` | D-Cloud 접속 정보 (Secrets Manager) |
| `iam_team.tf` | 팀원 IAM 계정 |
| `realtime_ws.tf` | C파트 전용 리소스 |

## 실행 순서

`.kr` 도메인은 Route 53에서 등록이 안 되므로 네임서버 변경이 선행되어야 한다.
반영에 최대 48시간이 걸리고, 그 전에는 ACM 인증서 검증이 끝나지 않아
`terraform apply` 가 대기 상태로 멈춘다.

```bash
# 1) 비밀번호 준비 (파일로 남기지 않는 편이 안전하다)
export TF_VAR_dcloud_db_password='...'

terraform init

# 2) 호스팅 영역만 먼저 만들고 네임서버를 등록기관에 등록
terraform apply -target=aws_route53_zone.main
terraform output route53_nameservers

# 3) 반영 확인 — 위 4개가 그대로 나와야 한다
dig NS queuing.kr +short

# 4) 전체 배포
terraform apply
```

## 배포 후 반드시 할 일

### D-Cloud 화이트리스트

D-Cloud 는 출발지 IP 로 접속을 허용한다. EKS 파드는 NAT 의 EIP 로 나가므로
그 주소를 등록해야 하며, 그 전에는 DB 접속이 `Access denied` 로 막힌다.

```bash
terraform output -raw nat_eip     # 이 주소를 D-Cloud 관리자에게 전달
terraform output dcloud_whitelist_guide
```

### metrics-server 설치

EKS 는 metrics-server 를 기본 제공하지 않는다. 없으면 모든 HPA 가
`<unknown>` 으로 뜨고 오토스케일링이 전혀 동작하지 않는다.

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

## 아직 없는 것 (각 파트에서 추가)

| 항목 | 필요한 파트 |
| --- | --- |
| SQS · DLQ | B (건아) — KEDA 스케일링 트리거 |
| SES | B (건아) — 메일 발송. **샌드박스 해제 신청에 1~2일 걸리므로 미리 신청** |
| SNS | A (찬규) — 알림 |
| IRSA (OIDC 공급자) | 공통 — ServiceAccount 별 권한. 지금은 노드 역할에 붙어 있어 같은 노드의 모든 파드가 같은 권한을 갖는다 |
| RDS | 공통 — D-Cloud 를 계속 쓸지, RDS 로 옮길지 결정 후 |
