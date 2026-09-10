# ──────────────────────────────────────────────
# terraform apply 후 클러스터 안에서 해야 하는 일을 한 번에 처리한다.
#
# ■ 왜 테라폼이 아니라 스크립트인가
# 클러스터를 만드는 같은 apply 안에서 그 클러스터에 붙는 kubernetes/helm
# 프로바이더를 설정하면, 빈 상태에서 plan 이 깨지고 destroy 순서도 꼬인다.
# 흔한 함정이라 일부러 분리했다.
#
# ■ 실행
#   powershell -ExecutionPolicy Bypass -File D:\realtime-ws-work\shared-infra\aws-bootstrap.ps1
#
# ■ 몇 번을 돌려도 안전하다
# 모든 단계가 멱등이다. 이미 있으면 그대로 두고 넘어간다.
#
# ■ 하지 않는 것
#   - 프론트엔드 업로드 (빌드가 필요하고 찬규님 저장소에 있다)
#   - A/B/D파트 배포 (각 차트가 아직 AWS 용으로 수정되지 않았다)
#     A: timerService.js 의 CONFIG SET, B: 템플릿의 LocalStack 하드코딩
# ──────────────────────────────────────────────

$ErrorActionPreference = "Stop"

$TF_DIR    = "D:\realtime-ws-work\terraform-final"
$WS_CHART  = "D:\realtime-ws-work\realtime-ws\helm-chart\realtime-ws-chart"
$REGION    = "ap-northeast-2"
$CLUSTER   = "queuing-eks"

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Ok($msg)       { Write-Host "    OK  $msg" -ForegroundColor Green }
function Warn($msg)     { Write-Host "    !!  $msg" -ForegroundColor Yellow }

# ── 1. kubeconfig ──
Step 1 "kubeconfig 를 EKS 로 전환"
aws eks update-kubeconfig --region $REGION --name $CLUSTER
$ctx = (kubectl config current-context)
if ($ctx -notlike "*$CLUSTER*") {
    throw "컨텍스트가 EKS 가 아니다: $ctx  (온프레미스에 실행할 뻔했다)"
}
Ok "컨텍스트: $ctx"

# ⚠️ 이 확인이 중요하다. 온프레미스와 EKS 를 오가다 보면 섞이기 쉽고,
#    잘못 실행하면 잘 돌던 온프레미스 배포를 덮어쓴다.

# ── 2. 노드 준비 대기 ──
Step 2 "노드가 Ready 가 될 때까지 대기"
kubectl wait --for=condition=Ready nodes --all --timeout=300s
kubectl get nodes

# ── 3. 네임스페이스 ──
# create 는 이미 있으면 실패하므로 dry-run + apply 로 멱등하게 만든다.
Step 3 "네임스페이스 생성"
$namespaces = @(
    "queuing-a",   # A 찬규 - 예매 API
    "queuing-b",   # B 건아 - 재판매 워커
    "realtime",    # C 지예 - WebSocket (queuing-c 가 아니다)
    "queuing-c",   # C 예비 (지금은 안 쓴다)
    "argocd",      # 공용 - 배포 파이프라인
    "monitoring",  # D 예지 - Prometheus
    "redis",       # D 예지 - redis-counter
    "queuing-d"    # D 예지 - 카운터 앱
)
foreach ($ns in $namespaces) {
    kubectl create namespace $ns --dry-run=client -o yaml | kubectl apply -f - | Out-Null
}
Ok "$($namespaces.Count) 개"

# ⚠️ 차트가 templates/namespace.yaml 로 네임스페이스를 직접 만드는 경우
#    (A파트 redis-api-chart) helm 이 소유권 문제로 거부한다. 아래 4-1 참고.

# ── 4. metrics-server ──
# EKS 는 기본 제공하지 않는다. 없으면 모든 HPA 가 <unknown> 이고
# 오토스케일링이 전혀 동작하지 않는다.
Step 4 "metrics-server 설치"
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
Ok "설치 요청 완료 (Ready 까지 1~2분)"

# ── 4-1. A파트 네임스페이스를 helm 이 인수하게 ──
# redis-api-chart 가 namespace 를 직접 만들기 때문에, 위에서 미리 만들어두면
# helm 이 "소유권 메타데이터가 없다"며 설치를 거부한다.
Step "4-1" "queuing-a 를 helm 소유로 표시"
kubectl label namespace queuing-a app.kubernetes.io/managed-by=Helm --overwrite | Out-Null
kubectl annotate namespace queuing-a `
    meta.helm.sh/release-name=api `
    meta.helm.sh/release-namespace=queuing-a --overwrite | Out-Null
Ok "완료"

# ── 5. ElastiCache 주소 ──
# ⚠️ destroy/apply 를 하면 주소가 바뀔 수 있다. 반드시 매번 다시 읽어야 한다.
Step 5 "ElastiCache 주소 확인"
Push-Location $TF_DIR
$REDIS = (terraform output -raw redis_endpoint)
Pop-Location
if ([string]::IsNullOrWhiteSpace($REDIS)) { throw "redis_endpoint 를 읽지 못했다" }
Ok $REDIS

# ── 6. DB 비밀번호 Secret ──
# ⚠️ 키 이름은 반드시 MARIADB_ROOT_PASSWORD 다.
#    A파트 차트가 그 이름으로 참조한다. password 로 만들면 환경변수가
#    조용히 비고 원인을 찾기 어렵다.
Step 6 "DB 비밀번호 Secret"
$existing = kubectl -n queuing-a get secret mariadb-credentials -o name --ignore-not-found
if ($existing) {
    Ok "이미 있음 - 건너뜀 (다시 만들려면 먼저 delete)"
} else {
    $sec = Read-Host "    D-Cloud DB 비밀번호 (입력은 화면에 보이지 않는다)" -AsSecureString
    $bstr  = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

    kubectl -n queuing-a create secret generic mariadb-credentials `
        --from-literal=MARIADB_ROOT_PASSWORD=$plain `
        --dry-run=client -o yaml | kubectl apply -f - | Out-Null
    $plain = $null
    Ok "생성 완료"
}

# ── 7. C파트 배포 ──
# statsRedis  : D파트 Redis 가 아직 EKS 에 없어서 끈다
# serviceMonitor : Prometheus 가 아직 없어서 끈다 (CRD 가 없으면 설치 실패)
# ⚠️ 키 경로가 config.redisHost 가 아니라 env.redisHost 다.
#    틀린 키로 --set 하면 helm 이 새 키를 만들고 실제 값은 기본값(온프레미스
#    주소) 그대로 남는다. 에러 없이 조용히 틀리는 종류다.
Step 7 "C파트(WebSocket) 배포"
helm -n realtime upgrade --install realtime-ws $WS_CHART `
    --set env.redisHost=$REDIS `
    --set statsRedis.enabled=false `
    --set serviceMonitor.enabled=false
Ok "배포 요청 완료"

# ── 8. 확인 ──
Step 8 "상태 확인"
kubectl -n realtime rollout status deploy/realtime-ws --timeout=180s

Write-Host "`n    주입된 REDIS_HOST 를 확인한다 (아래 값이 ElastiCache 여야 한다):"
kubectl -n realtime get deploy realtime-ws -o jsonpath="{.spec.template.spec.containers[0].env[?(@.name=='REDIS_HOST')].value}"
Write-Host ""

Write-Host "`n────────────────────────────────────────" -ForegroundColor Cyan
Write-Host " 남은 수동 작업" -ForegroundColor Cyan
Write-Host "────────────────────────────────────────" -ForegroundColor Cyan
Write-Host @"
  1) 프론트엔드 업로드 (찬규님 저장소에서 빌드 후)
       terraform -chdir=$TF_DIR output frontend_deploy_guide

  2) A파트 - timerService.js 의 CONFIG SET 을 try/catch 로 감싼 이미지가
     나오면 배포:
       helm -n queuing-a upgrade --install api D:\realtime-ws-work\chan-chart --set image.tag=<새태그>

  3) B파트 - 차트의 LocalStack 하드코딩이 제거되면 배포. KEDA 도 필요:
       helm repo add kedacore https://kedacore.github.io/charts
       helm -n keda upgrade --install keda kedacore/keda --create-namespace

  4) 모니터링 - kube-prometheus-stack (values 를 EKS 용으로 손봐야 한다:
     grafana.enabled, service.type, volumeName 제거)

  5) 접속 확인
       curl -i https://api.queuing.kr/healthz
"@
