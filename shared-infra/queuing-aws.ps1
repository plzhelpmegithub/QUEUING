# ──────────────────────────────────────────────
# QUEUING AWS 환경 — 올리기 / 내리기 / 상태  (파일 하나로 전부)
#
# 위치: D:\realtime-ws-work\shared-infra\queuing-aws.ps1
#
# ■ 쓰는 법 (PowerShell)
#   .\queuing-aws.ps1 up        아침: terraform apply -> 클러스터 안 전부
#   .\queuing-aws.ps1 down      저녁: 순서 지켜서 destroy -> 남은 찌꺼기 정리
#   .\queuing-aws.ps1 status    지금 상태만 본다 (아무것도 바꾸지 않는다)
#
#   옵션
#     -SkipTerraform          up 에서 terraform apply 를 건너뛴다 (같은 날 다시 돌릴 때)
#     -DryRun                 아무것도 바꾸지 않고 전 과정을 시험한다
#                             (kubectl/helm 은 --dry-run=server, terraform 은 plan)
#     -ResetSecret KEY,...    저장된 비밀값을 다시 입력받는다 (all = 전부)
#
# ■ 이 파일이 대체하는 것
#   aws-bootstrap.ps1, aws-restore.ps1, chan/yeji/geonah-rbac-eks.yaml,
#   eks-storageclass.yaml, monitoring-values-eks.yaml
#
# ■ 매일 destroy 를 전제로 설계했다
#   - 클러스터 안의 모든 것(Secret, helm, PVC)과 S3·ECR·Secrets Manager 는 매일 사라진다.
#   - 프론트엔드(S3) 업로드는 찬규님 몫이라 이 파일은 하지 않는다.
#   - 그래서 비밀값은 AWS 가 아니라 이 PC 에 암호화해 둔다:
#       %APPDATA%\queuing\secrets.clixml
#     Windows DPAPI 로 암호화되어 이 PC 의 이 사용자만 풀 수 있다. 깃에 올라가지 않는다.
#     처음 한 번만 물어보고, 다음 날부터는 묻지 않는다.
#   - destroy 에도 남아야 하는 것은 terraform 밖에 있다:
#       NAT EIP 54.116.100.145, SES queuing.kr 도메인 인증, Route53 호스팅 영역,
#       예지님 Grafana EC2 (terraform-yeji-grafana, 따로 관리)
#   - 예지님 Grafana EC2 → Prometheus 연결(피어링·내부 NLB)은 terraform-final 의
#     yeji_prometheus_link.tf 가 매일 만든다. 데이터소스 주소는 http://10.0.20.10:9090 로 고정.
#
# ■ 2026-09-10~11 에 실제로 겪은 문제와 이 파일의 대응
#   외부 명령 실패가 "OK" 로 찍힘   -> 모든 kubectl/helm/aws 호출의 종료 코드를 확인한다
#   C파트 업그레이드가 조용히 실패   -> 모니터링(ServiceMonitor CRD)을 앱보다 먼저 설치한다
#   D파트 차트 경로 한 겹 남음      -> "브랜치:경로" zip 으로 받아 벗겨낼 필요 자체를 없앴다
#   한글 파일명 추출 실패            -> tar 대신 zip (dry-run 으로 발견)
#   Flow Log 로그 그룹 재생성        -> down 에서 Flow Log 먼저 지우고, up 전에 남은 그룹을 정리한다
#   reCAPTCHA 키 붙여넣기 오류       -> 40자인지 검사하고 틀리면 다시 묻는다
#   Role 이 네임스페이스 자체를 지움 -> RBAC 에서 namespaces 를 빼고 그룹을 열거한다
#
# ■ 2026-09-11 오후에 추가한 확인 (up 끝과 status 에서 돈다. 읽기만 한다)
#   SES 도메인 인증이 손으로 지워져 메일 전부 실패 -> 도메인 인증 상태를 경고로 띄운다
#   /publish·/metrics 가 인터넷에 열려 있었음      -> 403 으로 막혀 있는지 본다 (막는 건 alb.tf)
#   Jenkins 8080 이 0.0.0.0/0                        -> 인터넷 전체에 열려 있으면 경고
#   노드당 파드 한도 17 (t3.medium, VPC CNI)          -> 노드별 남은 자리를 보여준다
#   terraform output -json 해석 실패로 3단계에서 멈춤 -> 외부 명령 출력을 UTF-8 로 읽는다
#   B파트(건아) Step Functions + Lambda 5개           -> apply 전에 건아님 브랜치에서 패키지를 만들고,
#                                                       DB 비밀번호는 apply 동안만 TF_VAR 로 넘기고,
#                                                       콜백 API Lambda 3종 zip 도 같이 만든다 (2026-09-16)
#     (한국어 윈도우 콘솔 기본 cp949 에서만 난다. UTF-8 콘솔에서는 재현되지 않아 dry-run 이 놓쳤다)
#   예지님 Grafana(EC2) B안                          -> 클러스터 안 Grafana 를 내리고 Prometheus 를
#                                                       NodePort 로 열어 NLB 대상 상태를 본다
#
# ■ 2026-09-12 노드 자동 증설 (Cluster Autoscaler)
#   노드 2대 x 파드 17 = 34자리 중 평소 27개 사용   -> HPA 가 7개 넘게 늘리면 Pending 이었다.
#                                                       7단계에서 Cluster Autoscaler 를 설치한다.
#                                                       IAM 역할·대상 ASG 는 terraform-final/cluster_autoscaler.tf 출력에서 읽는다
# ──────────────────────────────────────────────

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("up", "down", "status")]
    [string]   $Action = "status",

    [string]   $RepoDir     = "D:\realtime-ws-work",
    [string]   $Region      = "ap-northeast-2",
    [string]   $Cluster     = "queuing-eks",
    [string]   $SecretStore = (Join-Path $env:APPDATA "queuing\secrets.clixml"),
    [string[]] $ResetSecret = @(),
    [switch]   $SkipTerraform,
    [switch]   $DryRun
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
# 외부 프로그램 표준입력으로 넘기는 텍스트(kubectl apply -f -)를 UTF-8 로 보낸다.
# PowerShell 5.1 기본값은 ASCII 라서 한글이 ? 로 바뀐다.
$OutputEncoding = $Utf8NoBom

$TfDir   = Join-Path $RepoDir "terraform-final"
$ChartC  = Join-Path $RepoDir "realtime-ws\helm-chart\realtime-ws-chart"
$Work    = Join-Path $env:TEMP "queuing-aws"
$script:Warnings = New-Object System.Collections.Generic.List[string]

# ══════════════════════════════════════════════
# 고정값 — 바꿀 일이 생기면 여기만 고친다
# ══════════════════════════════════════════════
$Versions = @{
    Monitoring    = "88.6.0"   # 릴리즈 이름 monitoring 과 함께 고정 (ServiceMonitor 선택 라벨)
    MetricsServer = "v0.9.0"
    ClusterAutoscaler = "9.53.0"   # 차트 9.53.0 = 앱 v1.34.2. 쿠버네티스 마이너 버전(1.34)과 맞춘다. EKS 를 올리면 같이 올린다
}
$Namespaces = @("queuing-a", "queuing-b", "queuing-d", "realtime", "redis", "monitoring", "argocd")
$FlowLogGroup = "/aws/vpc-flow-logs/queuing"
$Endpoints = @("https://api.queuing.kr/health", "https://api.queuing.kr/healthz", "https://queuing.kr/events")
# 인터넷에서 403 이어야 하는 경로 (terraform-final/alb.tf block_internal)
$BlockedEndpoints = @("https://api.queuing.kr/metrics", "https://api.queuing.kr/publish/seat/healthcheck")
$SesDomain = "queuing.kr"
# terraform-final/yeji_prometheus_link.tf 의 var.prometheus_nodeport 와 같아야 한다
$PrometheusNodePort = 30090
$PrometheusLinkTg   = "queuing-prom-tg"
$SecretId = "queuing-persistent/app-secrets"   # 비밀값 원본. terraform 밖이라 매일 destroy 에도 남는다

# B파트(건아) 취소표 순차 배정. terraform-final/b_part_resale_workflow.tf 와 이름·경로가 맞아야 한다.
# 코드는 건아님 브랜치에서 읽기만 한다.
$BPart = @{
    Branch       = "origin/geonah/aws-migration"
    LambdaPath   = "lambda/b-part"
    AslPath      = "step-functions/b-part"
    BuildDir     = (Join-Path $TfDir ".terraform\queuing-build\b-part")   # .terraform/ 은 깃에 안 올라간다
    StateMachine = "queuing-b-resale-workflow"
    Functions    = @("queuing-b-get-next-user", "queuing-b-generate-signed-link", "queuing-b-send-email-via-ses", "queuing-b-update-allocation-status", "queuing-b-push-to-dlq")
    Trigger      = "queuing-b-trigger-resale-workflow"   # SQS queuing-cancellation-events 에 연결, DB 비밀번호 없음
}

# 팀원 EKS 권한. 각자 본인 네임스페이스 안에서는 전권, 네임스페이스 자체와 클러스터 범위 쓰기는 불가.
$Team = @(
    @{ User = "chan";   Namespaces = @("queuing-a") }
    @{ User = "geonah"; Namespaces = @("queuing-b") }
    @{ User = "yeji";   Namespaces = @("monitoring", "redis", "queuing-d") }
)

# ══════════════════════════════════════════════
# 출력
# ══════════════════════════════════════════════
function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Ok($msg)       { Write-Host "    OK   $msg" -ForegroundColor Green }
function Info($msg)     { Write-Host "    ..   $msg" -ForegroundColor Gray }
function Warn($msg)     { Write-Host "    !!   $msg" -ForegroundColor Yellow; $script:Warnings.Add($msg) }
function Die($msg)      { Write-Host "`n    XX   $msg" -ForegroundColor Red; exit 1 }

# ══════════════════════════════════════════════
# 외부 명령 실행
# ══════════════════════════════════════════════
# PowerShell 5.1 은 외부 프로그램이 실패해도 멈추지 않는다. 여기서 종료 코드를 반드시 본다.
# 표준출력은 숨기고(잡음), 표준에러는 그대로 화면에 보인다(실패 원인).
function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]   $What,
        [Parameter(Mandatory)][string]   $Exe,
        [string[]] $ArgList = @(),
        [string[]] $DryRunArgs,        # DryRun 이면 이 인자를 붙여 실제로 실행한다
        [switch]   $SkipInDryRun,      # DryRun 이면 실행하지 않는다
        [string]   $InputText,         # 표준입력 (kubectl apply -f -)
        [switch]   $PassThru           # 표준출력을 돌려받는다
    )
    $a = @($ArgList)
    if ($DryRun) {
        if ($SkipInDryRun) { Info "[dry-run] 건너뜀: $What"; if ($PassThru) { return "" } else { return $true } }
        if ($DryRunArgs) { $a = @($a | Where-Object { $_ -ne "--wait" }) + $DryRunArgs }
    }
    $old = $ErrorActionPreference
    $oldEnc = [Console]::OutputEncoding
    $ErrorActionPreference = "Continue"
    Set-ConsoleOutputEncoding $Utf8NoBom   # 표준출력을 UTF-8 로 받는다 (Read-Native 설명 참고)
    try {
        if ($PSBoundParameters.ContainsKey("InputText")) { $out = $InputText | & $Exe @a }
        else { $out = & $Exe @a }
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $old; Set-ConsoleOutputEncoding $oldEnc }

    if ($code -ne 0) {
        Warn "$What 실패 (exit $code) - 바로 위 에러 메시지를 확인한다"
        if ($PassThru) { return $null } else { return $false }
    }
    if ($PassThru) { return ($out -join "`n") } else { return $true }
}

# 읽기 전용 조회. 에러 출력은 버리고 표준출력만 돌려준다.
# ⚠️ 외부 명령의 에러 출력을 버릴 때는 반드시 이 함수를 쓴다. PowerShell 5.1 에서
#    $ErrorActionPreference = "Stop" 인 채로 외부 명령에 2>$null 을 붙이면, 에러를 버리는
#    게 아니라 스크립트가 멈춘다 (2026-09-11 직접 확인: RemoteException).
#
# ⚠️ 외부 프로그램의 표준출력은 콘솔 코드페이지로 해석된다. 한국어 윈도우 기본은 cp949 인데
#    terraform·kubectl·aws 는 UTF-8 로 내보낸다. 그러면 한글이 깨지면서 뒤따르는 따옴표까지
#    먹혀 JSON 이 망가진다 (2026-09-11 terraform output -json 이 8817 번째 글자에서 실패).
#    출력을 받는 동안만 UTF-8 로 바꾸고 끝나면 원래 코드페이지로 돌려놓는다.
function Set-ConsoleOutputEncoding($Encoding) {
    try { [Console]::OutputEncoding = $Encoding } catch { }   # 콘솔이 없는 환경에서는 바꿀 필요도 없다
}

function Read-Native([string]$Exe, [string[]]$ArgList) {
    $old = $ErrorActionPreference
    $oldEnc = [Console]::OutputEncoding
    $ErrorActionPreference = "Continue"
    Set-ConsoleOutputEncoding $Utf8NoBom
    try { $o = & $Exe @ArgList 2>$null; $script:ReadExit = $LASTEXITCODE; return $o }
    finally { $ErrorActionPreference = $old; Set-ConsoleOutputEncoding $oldEnc }
}

function Kube([string]$What, [string[]]$ArgList, [string]$InputText) {
    $p = @{ What = $What; Exe = "kubectl"; ArgList = $ArgList; DryRunArgs = @("--dry-run=server") }
    if ($PSBoundParameters.ContainsKey("InputText")) { $p.InputText = $InputText }
    return (Invoke-Native @p)
}

function Helm-Release([string]$What, [string]$Ns, [string]$Release, [string]$Chart, [string[]]$Extra = @(), [switch]$Wait) {
    $a = @("upgrade", "--install", $Release, $Chart, "-n", $Ns, "--timeout", "10m") + $Extra
    if ($Wait) { $a += "--wait" }
    return (Invoke-Native -What $What -Exe "helm" -ArgList $a -DryRunArgs @("--dry-run=server"))
}

# ══════════════════════════════════════════════
# 비밀값 저장소 (AWS Secrets Manager)
# ══════════════════════════════════════════════
function Get-Plain([Security.SecureString]$s) {
    return (New-Object System.Management.Automation.PSCredential("x", $s)).GetNetworkCredential().Password
}

#Secret키 반영
function Read-Store {
    $s = @{}
    $n = Read-Native "aws" @("secretsmanager", "list-secrets", "--region", $Region, "--filters", "Key=name,Values=$SecretId", "--query", "length(SecretList)", "--output", "text")
    if ($script:ReadExit -ne 0) { Die "Secrets Manager 조회 실패 (aws 자격 증명 확인)" }
    $script:SecretExists = ("$n".Trim() -ne "0")
    if ($script:SecretExists) {
        $json = Read-Native "aws" @("secretsmanager", "get-secret-value", "--region", $Region, "--secret-id", $SecretId, "--query", "SecretString", "--output", "text")
        # 읽기가 실패한 채로 진행하면 빈 값으로 덮어쓸 수 있다. 여기서 멈춘다.
        if ($script:ReadExit -ne 0 -or -not "$json".Trim()) { Die "$SecretId 값을 읽지 못했다" }
        ($json | Out-String | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $s[$_.Name] = ConvertTo-SecureString ([string]$_.Value) -AsPlainText -Force }
    }
    foreach ($k in $ResetSecret) {
        if ($k -eq "all") { $s = @{}; break }
        if ($s.ContainsKey($k)) { $s.Remove($k) }
    }
    return $s
}

function Save-Store($Store) {
    if ($DryRun) { Info "[dry-run] 비밀값 저장 건너뜀"; return }
    $plain = [ordered]@{}
    foreach ($k in ($Store.Keys | Sort-Object)) { $plain[$k] = Get-Plain $Store[$k] }
    # 값은 파일로 넘긴다. 명령줄에 넣으면 PowerShell 5.1 에서 따옴표가 깨지고 프로세스 목록에 보인다.
    $tmp = [IO.Path]::GetTempFileName()
    try {
        [IO.File]::WriteAllText($tmp, ($plain | ConvertTo-Json -Compress), $Utf8NoBom)
        if ($script:SecretExists) { $ok = Invoke-Native "Secrets Manager 값 갱신" "aws" @("secretsmanager", "put-secret-value", "--region", $Region, "--secret-id", $SecretId, "--secret-string", "file://$tmp") }
        else { $ok = Invoke-Native "Secrets Manager 생성" "aws" @("secretsmanager", "create-secret", "--region", $Region, "--name", $SecretId, "--description", "QUEUING app secrets for queuing-aws.ps1, kept outside daily destroy", "--secret-string", "file://$tmp") }
        if (-not $ok) { Die "$SecretId 저장 실패" }
        $script:SecretExists = $true
    } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue; $plain = $null }
}

# 64자리 16진수. A파트 authTokenService.js 가 32자 이상을 요구한다.
function New-RandomKey { return ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")) }

function Get-StoredSecret {
    param($Store, [string]$Key, [string]$Prompt, [int]$Length = 0, [switch]$Generate)
    if ($Store.ContainsKey($Key)) {
        $v = Get-Plain $Store[$Key]
        if ($Length -and $v.Length -ne $Length) { Die "저장된 $Key 길이가 $($v.Length) 이다 ($Length 이어야 한다). -ResetSecret $Key 로 다시 입력한다" }
        return $v
    }
    if ($Generate) { $v = New-RandomKey }
    else {
        for ($i = 1; $i -le 3; $i++) {
            $v = Get-Plain (Read-Host "    $Prompt" -AsSecureString)
            if ([string]::IsNullOrEmpty($v)) { Write-Host "         비어 있다. 다시 입력한다" -ForegroundColor Yellow; continue }
            # 붙여넣기가 겹치면 길이가 두 배가 된다 (2026-09-11 에 실제로 있었다)
            if ($Length -and $v.Length -ne $Length) { Write-Host "         길이 $($v.Length) - $Length 자여야 한다. 다시 입력한다" -ForegroundColor Yellow; $v = $null; continue }
            break
        }
        if ([string]::IsNullOrEmpty($v)) { Die "$Key 입력 실패" }
    }
    $Store[$Key] = ConvertTo-SecureString $v -AsPlainText -Force
    $script:StoreDirty = $true
    return $v
}

# ══════════════════════════════════════════════
# 쿠버네티스 리소스 만들기
# ══════════════════════════════════════════════
# 값은 파일로 넘긴다. 명령줄에 넣으면 따옴표가 섞인 값이 PowerShell 5.1 에서 깨지고,
# 실행 중인 프로세스 목록에 비밀번호가 보인다.
# server-side apply 라서 여러 번 돌려도 같고, 값이 달라졌으면 저장소 값으로 맞춘다.
function Set-K8sSecret([string]$Ns, [string]$Name, [System.Collections.Specialized.OrderedDictionary]$Data) {
    $dir = Join-Path $Work ("s-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
    New-Item -ItemType Directory -Path $dir | Out-Null
    try {
        $a = @("-n", $Ns, "create", "secret", "generic", $Name, "--dry-run=client", "-o", "yaml")
        foreach ($k in $Data.Keys) {
            $f = Join-Path $dir $k
            [IO.File]::WriteAllText($f, [string]$Data[$k], (New-Object System.Text.UTF8Encoding $false))
            $a += "--from-file=$k=$f"
        }
        $yaml = Invoke-Native -What "Secret $Ns/$Name 생성(yaml)" -Exe "kubectl" -ArgList $a -PassThru
        if ($null -eq $yaml) { return }
        if (Kube "Secret $Ns/$Name" @("apply", "--server-side", "--force-conflicts", "-f", "-") $yaml) { Ok "Secret $Ns/$Name ($($Data.Keys -join ', '))" }
    } finally { Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue }
}

function Get-TeamRbacYaml([string]$AccountId) {
    $q = { param($xs) '[' + (($xs | ForEach-Object { '"' + $_ + '"' }) -join ', ') + ']' }
    # namespaces 를 넣지 않는 것이 핵심이다. DELETE /api/v1/namespaces/<이름> 은 그 네임스페이스
    # 안의 요청으로 평가되어, 여기에 namespaces 가 있으면 Role 이 네임스페이스 자신을 지운다.
    $core = & $q @("pods", "pods/log", "pods/exec", "pods/attach", "pods/portforward", "pods/ephemeralcontainers",
        "services", "services/proxy", "endpoints", "configmaps", "secrets", "serviceaccounts", "serviceaccounts/token",
        "persistentvolumeclaims", "replicationcontrollers", "podtemplates", "events", "limitranges", "resourcequotas")
    # "*" 를 쓰면 core("") 까지 포함되어 위의 제한이 무력화된다. 반드시 열거한다.
    $groups = & $q @("apps", "batch", "autoscaling", "networking.k8s.io", "policy", "rbac.authorization.k8s.io",
        "discovery.k8s.io", "events.k8s.io", "coordination.k8s.io", "monitoring.coreos.com", "argoproj.io")

    $docs = New-Object System.Collections.Generic.List[string]
    foreach ($m in $Team) {
        $u = $m.User
        $arn = "arn:aws:iam::${AccountId}:user/$u"
        $extra = ""
        # A파트 차트의 templates/namespace.yaml 때문에 helm 이 Namespace 라벨을 써야 한다. 삭제는 주지 않는다.
        if ($u -eq "chan") {
            $extra = "`n  - apiGroups: [`"`"]`n    resources: [`"namespaces`"]`n    resourceNames: [`"queuing-a`"]`n    verbs: [`"patch`", `"update`"]"
        }
        $docs.Add(@"
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: $u-eks-cluster-read
rules:
  - apiGroups: [""]
    resources: ["namespaces", "nodes", "persistentvolumes"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apiextensions.k8s.io"]
    resources: ["customresourcedefinitions"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["storage.k8s.io"]
    resources: ["storageclasses"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["monitoring.coreos.com"]
    resources: ["*"]
    verbs: ["get", "list", "watch"]$extra
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: $u-eks-cluster-read
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: $u-eks-cluster-read
subjects:
  - kind: User
    name: $arn
    apiGroup: rbac.authorization.k8s.io
"@)
        foreach ($ns in $m.Namespaces) {
            $docs.Add(@"
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: $u-ns-admin
  namespace: $ns
rules:
  - apiGroups: [""]
    resources: $core
    verbs: ["*"]
  - apiGroups: $groups
    resources: ["*"]
    verbs: ["*"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: $u-ns-admin
  namespace: $ns
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: $u-ns-admin
subjects:
  - kind: User
    name: $arn
    apiGroup: rbac.authorization.k8s.io
"@)
        }
    }
    return ($docs -join "`n---`n")
}

# 기본 StorageClass. 모니터링보다 먼저 있어야 한다.
# EKS 기본 gp2 는 default 가 아니고 제공자(kubernetes.io/aws-ebs)가 K8s 1.31 에서 제거됐다.
# 없으면 PVC 가 에러 없이 영원히 Pending 이 된다.
$StorageClassYaml = @"
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
reclaimPolicy: Delete
allowVolumeExpansion: true
parameters:
  type: gp3
  encrypted: "true"
"@

# kube-prometheus-stack 값.
#
# Grafana 는 클러스터 안에 두지 않는다 (2026-09-11 예지님 B안).
#   화면은 예지님 EC2 Grafana 하나로 합치고, 데이터소스로 Prometheus 와 CloudWatch 를 붙인다.
#   클러스터가 죽어도 CloudWatch 패널은 EC2 에 살아 있다.
#
# Prometheus 는 NodePort 로 연다. Prometheus 는 인증이 없지만 인터넷에는 열리지 않는다:
#   - 인터넷 ALB 에는 이 포트로 가는 대상 그룹이 없다.
#   - 노드는 이 포트를 내부 NLB 보안그룹에서만 받고, NLB 는 예지님 EC2 IP 하나만 받는다.
#   (terraform-final/yeji_prometheus_link.tf)
$MonitoringValues = @"
grafana:
  enabled: false
prometheus:
  service:
    type: NodePort
    nodePort: $PrometheusNodePort
  prometheusSpec:
    storageSpec:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 10Gi
    retention: 7d
    resources:
      requests:
        cpu: 100m
        memory: 512Mi
      limits:
        memory: 1Gi
    serviceMonitorNamespaceSelector: {}
    podMonitorNamespaceSelector: {}
alertmanager:
  alertmanagerSpec:
    resources:
      requests:
        cpu: 50m
        memory: 128Mi
      limits:
        memory: 256Mi
"@

# 팀원 차트를 깃에서 읽기 전용으로 꺼낸다. 팀원 저장소는 건드리지 않는다.
# "브랜치:경로" 로 받으면 그 폴더의 내용만 루트에 담겨서, 경로가 몇 단계든 벗겨낼 필요가 없다.
#   (2026-09-11: tar --strip-components=1 고정 때문에 D파트 k8s/queuing-chart 가 한 겹 남았다)
# zip 으로 받는다. 윈도우 tar 는 한글 파일명을 풀지 못한다.
#   (2026-09-11 dry-run 에서 한글 파일명 5개가 실패했다)
function Export-FromGit([string]$Branch, [string]$PathInRepo, [string]$Dest) {
    if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
    $zip = Join-Path $Work ("g-" + [guid]::NewGuid().ToString("N").Substring(0, 8) + ".zip")
    if (-not (Invoke-Native "git archive ${Branch}:$PathInRepo" "git" @("-C", $RepoDir, "archive", "--format=zip", "-o", $zip, "${Branch}:$PathInRepo"))) { return $false }
    try { Expand-Archive -Path $zip -DestinationPath $Dest -Force; return $true }
    catch { Warn "압축 해제 실패 ${Branch}:$PathInRepo - $($_.Exception.Message)"; return $false }
    finally { Remove-Item $zip -Force -ErrorAction SilentlyContinue }
}

# B파트 Lambda 패키지와 ASL 을 terraform 이 읽는 곳($BPart.BuildDir)에 만든다.
#   - 의존성(pymysql, PyJWT, boto3)은 Lambda 가 도는 리눅스 python3.12 용으로 받는다. 이 PC 의 python 버전과 무관하다.
#   - zip 은 python 으로 묶는다. PowerShell 5.1 Compress-Archive 는 폴더 경로를 역슬래시로 넣어서
#     리눅스 Lambda 가 pymysql 같은 패키지를 import 하지 못한다.
function Build-BPartWorkflow {
    Step "2-1" "B파트 Lambda 패키지 ($($BPart.Branch))"
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Warn "python 을 찾을 수 없다"; return $false }
    [void](Invoke-Native "git fetch" "git" @("-C", $RepoDir, "fetch", "origin", "--quiet"))
    $src = Join-Path $Work "bpart-src"; $sfn = Join-Path $Work "bpart-sfn"; $pkg = Join-Path $Work "bpart-pkg"
    if (Test-Path $pkg) { Remove-Item -Recurse -Force $pkg }
    if (-not (Export-FromGit $BPart.Branch $BPart.LambdaPath $src)) { return $false }
    if (-not (Export-FromGit $BPart.Branch $BPart.AslPath $sfn)) { return $false }
    $asl = Join-Path $sfn "resale-workflow.asl.json"
    if (-not (Test-Path $asl)) { Warn "ASL 파일이 없다: $($BPart.AslPath)/resale-workflow.asl.json"; return $false }
    if (-not (Invoke-Native "pip (리눅스 python3.12 용)" "python" @("-m", "pip", "install", "-q", "--disable-pip-version-check",
                "-r", (Join-Path $src "requirements.txt"), "-t", $pkg,
                "--platform", "manylinux2014_x86_64", "--only-binary=:all:", "--python-version", "3.12", "--implementation", "cp"))) { return $false }
    Copy-Item (Join-Path $src "*.py") $pkg
    if (-not (Test-Path $BPart.BuildDir)) { New-Item -ItemType Directory -Force -Path $BPart.BuildDir | Out-Null }
    $zipBase = Join-Path $BPart.BuildDir "lambda"
    if (-not (Invoke-Native "Lambda zip" "python" @("-c", "import shutil,sys; shutil.make_archive(sys.argv[1], 'zip', root_dir=sys.argv[2])", $zipBase, $pkg))) { return $false }
    Copy-Item $asl (Join-Path $BPart.BuildDir "resale-workflow.asl.json") -Force
    # 콜백 API 3종은 함수마다 zip 을 따로 만든다 (handler.py 이름이 셋 다 같아 한 zip 에 못 넣는다).
    #   내용 = 공용 의존성(pip 결과) + 그 함수의 handler.py + common/ 3개 파일 (건아님 요청, 2026-09-15)
    $cb = Join-Path $Work "bpart-cb"
    if (Export-FromGit $BPart.Branch "$($BPart.LambdaPath)/callback-api" $cb) {
        foreach ($fn in @("verify_link", "verify_link_complete", "verify_link_expire")) {
            $h = Join-Path $cb "$fn\handler.py"
            if (-not (Test-Path $h)) { Warn "콜백 함수 코드가 없다: callback-api/$fn/handler.py"; continue }
            $d = Join-Path $Work "bpart-cb-$fn"
            if (Test-Path $d) { Remove-Item -Recurse -Force $d }
            Copy-Item $pkg $d -Recurse
            # 워크플로용 .py 는 콜백 zip 에 필요 없다
            Get-ChildItem $src -Filter *.py | ForEach-Object { Remove-Item (Join-Path $d $_.Name) -Force -ErrorAction SilentlyContinue }
            Copy-Item $h $d
            Copy-Item (Join-Path $cb "common") $d -Recurse
            $z = Join-Path $BPart.BuildDir "callback-$fn"
            if (-not (Invoke-Native "콜백 zip ($fn)" "python" @("-c", "import shutil,sys; shutil.make_archive(sys.argv[1], 'zip', root_dir=sys.argv[2])", $z, $d))) { return $false }
        }
        Ok "콜백 API zip 3개"
    }
    else { Warn "콜백 API 코드를 꺼내지 못했다 - terraform 이 콜백 Lambda 를 만들지 못한다" }
    Ok ("Lambda 패키지 {0:N1}MB, ASL 복사 -> {1}" -f ((Get-Item "$zipBase.zip").Length / 1MB), $BPart.BuildDir)
    return $true
}

# ══════════════════════════════════════════════
# 확인 (up / status 공통, 읽기만 한다)
# ══════════════════════════════════════════════
function Show-Health([int]$WaitSeconds = 0) {
    Step "확인" "파드 · 릴리즈 · 외부 접속"
    # 배포 직후에는 아직 뜨는 중인 파드(ContainerCreating)가 있다. 곧바로 판정하면 정상인데도 경고가 난다.
    $sel = @("get", "pods", "-A", "--no-headers", "--field-selector=status.phase!=Running,status.phase!=Succeeded")
    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    $bad = Read-Native "kubectl" $sel
    while ($bad -and -not $DryRun -and (Get-Date) -lt $deadline) {
        Info "아직 뜨는 중인 파드 $(@($bad).Count)개 - 10초 뒤 다시 본다"
        Start-Sleep -Seconds 10
        $bad = Read-Native "kubectl" $sel
    }
    if ($bad) { Warn "Running 이 아닌 파드가 있다"; $bad | ForEach-Object { Write-Host "         $_" -ForegroundColor Yellow } }
    else { Ok "모든 파드 Running" }

    $rel = Read-Native "helm" @("list", "-A", "--no-headers")
    $rel | ForEach-Object { if ($_ -notmatch "\sdeployed\s") { Warn "helm 릴리즈 상태 이상: $_" } }
    $names = @($rel | ForEach-Object { ($_ -split "\s+")[0] })
    foreach ($r in @("monitoring", "counter", "realtime-ws", "api")) {
        if ($names -notcontains $r) { Warn "helm 릴리즈 없음: $r" }
    }

    foreach ($u in $Endpoints) {
        $code = Get-HttpStatus $u
        if ($code -ge 200 -and $code -lt 400) { Ok "$u -> $code" }
        else { Warn "$u -> $(if ($code) { $code } else { '연결 실패' })" }
    }

    # 인터넷에 열리면 안 되는 경로 (2026-09-11 /publish 로 가짜 좌석 이벤트를 누구나 보낼 수 있었다)
    foreach ($u in $BlockedEndpoints) {
        $code = Get-HttpStatus $u
        if ($code -eq 403) { Ok "$u -> 403 (막힘)" }
        else { Warn "$u -> $(if ($code) { $code } else { '연결 실패' }) (403 이어야 한다 - alb.tf block_internal 확인)" }
    }

    # 노드당 파드 한도. t3.medium 은 VPC CNI 로 17개까지다. 자리가 없으면 HPA 가 늘린 파드가 Pending 이 된다.
    $alloc = @(Read-Native "kubectl" @("get", "nodes", "--no-headers", "-o", "custom-columns=N:.metadata.name,P:.status.allocatable.pods"))
    $used  = @(Read-Native "kubectl" @("get", "pods", "-A", "--no-headers", "--field-selector=status.phase!=Succeeded,status.phase!=Failed", "-o", "custom-columns=N:.spec.nodeName"))
    foreach ($line in $alloc) {
        $parts = "$line".Trim() -split "\s+"
        if ($parts.Count -lt 2) { continue }
        $cnt  = @($used | Where-Object { "$_".Trim() -eq $parts[0] }).Count
        $free = [int]$parts[1] - $cnt
        $msg  = "파드 자리 $($parts[0] -replace '\..*$', '')  $cnt/$($parts[1]) (남은 $free)"
        if ($free -le 0) { Warn "$msg - 새 파드가 Pending 이 된다. 노드를 늘린다" } else { Info $msg }
    }

    # 노드 자동 증설. 설치돼 있으면 준비 상태와 CA 가 기록한 상태(cluster-autoscaler-status)를 본다.
    $caReady = "$(Read-Native "kubectl" @("-n", "kube-system", "get", "deploy", "cluster-autoscaler", "-o", "jsonpath={.status.readyReplicas}"))".Trim()
    if ($script:ReadExit -ne 0) { Info "Cluster Autoscaler 없음 (cluster_autoscaler_enabled = false 이거나 설치 전) - 노드는 수동으로만 늘어난다" }
    elseif ($caReady -ne "1") { Warn "Cluster Autoscaler 가 준비되지 않았다 (ready=$caReady) - kubectl -n kube-system logs deploy/cluster-autoscaler 확인" }
    else {
        $caStatus = "$(Read-Native "kubectl" @("-n", "kube-system", "get", "configmap", "cluster-autoscaler-status", "-o", "jsonpath={.data.status}"))"
        # 상태 문구 형식은 CA 버전마다 조금씩 달라서 "Healthy" 가 있는지만 본다
        if ($caStatus -match "Healthy") { Ok "Cluster Autoscaler Healthy" }
        else { Info "Cluster Autoscaler 실행 중 (상태 기록 전이거나 형식이 다르다 - kubectl -n kube-system get cm cluster-autoscaler-status -o yaml)" }
    }

    # 예지님 Grafana EC2 → Prometheus 연결
    $svc =Read-Native "kubectl" @("-n", "monitoring", "get", "svc", "monitoring-kube-prometheus-prometheus", "-o", "jsonpath={.spec.type}/{.spec.ports[?(@.port==9090)].nodePort}")
    if ("$svc" -eq "NodePort/$PrometheusNodePort") { Ok "Prometheus NodePort $PrometheusNodePort" }
    else { Warn "Prometheus 서비스가 NodePort/$PrometheusNodePort 가 아니다 ($svc) - 예지님 Grafana 가 못 붙는다" }
    $tg = Read-Native "aws" @("elbv2", "describe-target-groups", "--region", $Region, "--names", $PrometheusLinkTg, "--query", "TargetGroups[0].TargetGroupArn", "--output", "text")
    if ($script:ReadExit -ne 0 -or -not $tg) { Info "Prometheus 연결 NLB 없음 (terraform 의 yeji_prometheus_link 가 false 이거나 apply 전)" }
    else {
        $raw = Read-Native "aws" @("elbv2", "describe-target-health", "--region", $Region, "--target-group-arn", "$tg".Trim(), "--query", "TargetHealthDescriptions[].TargetHealth.State", "--output", "text")
        $states = @("$raw" -split "\s+" | Where-Object { $_ })
        $healthy = @($states | Where-Object { $_ -eq "healthy" }).Count
        if ($healthy -gt 0) { Ok "Prometheus 연결 NLB 대상 healthy $healthy/$($states.Count) (http://10.0.20.10:9090)" }
        elseif ($states -contains "initial") { Info "Prometheus 연결 NLB 대상 확인 중 (방금 올라와서 1~2분 걸린다)" }
        else { Warn "Prometheus 연결 NLB 에 healthy 대상이 없다 ($($states -join ','))" }
    }

    # B파트 워크플로 (Step Functions + Lambda 5개)
    $sm = Read-Native "aws" @("stepfunctions", "list-state-machines", "--region", $Region, "--query", "stateMachines[?name=='$($BPart.StateMachine)'].stateMachineArn", "--output", "text")
    if ($script:ReadExit -ne 0 -or -not "$sm".Trim()) { Info "B파트 워크플로 없음 (terraform apply 전이거나 b_resale_workflow = false)" }
    else {
        $bad = @()
        foreach ($fn in $BPart.Functions) {
            # 비밀번호 값은 읽지 않고 길이만 본다
            $st = Read-Native "aws" @("lambda", "get-function-configuration", "--region", $Region, "--function-name", $fn, "--query", "[State,length(Environment.Variables.MYSQL_PASSWORD)]", "--output", "text")
            $p = @("$st".Trim() -split "\s+")
            if ($script:ReadExit -ne 0 -or $p[0] -ne "Active") { $bad += "$fn 상태 $st" }
            elseif ($p.Count -lt 2 -or $p[1] -eq "0") { $bad += "$fn DB 비밀번호 비어 있음 (스크립트 없이 apply 로 새로 만든 것 같다 - up 으로 다시)" }
        }
        $tr = Read-Native "aws" @("lambda", "get-function-configuration", "--region", $Region, "--function-name", $BPart.Trigger, "--query", "State", "--output", "text")
        if ($script:ReadExit -ne 0 -or "$tr".Trim() -ne "Active") { $bad += "$($BPart.Trigger) 상태 $tr" }
        $esm = "$(Read-Native "aws" @("lambda", "list-event-source-mappings", "--region", $Region, "--function-name", $BPart.Trigger, "--query", "EventSourceMappings[0].State", "--output", "text"))".Trim()
        if ($esm -in @("Creating", "Enabling", "Updating")) { Info "B파트 트리거 SQS 연결 $esm (곧 Enabled 가 된다)" }
        elseif ($esm -ne "Enabled") { $bad += "$($BPart.Trigger) SQS 연결 상태 $esm (Enabled 여야 한다. 일부러 껐다면 b_trigger_enabled = false)" }
        if ($bad.Count) { $bad | ForEach-Object { Warn "B파트 Lambda $_" } }
        else { Ok "B파트 상태 머신 $($BPart.StateMachine) + Lambda $($BPart.Functions.Count)개 + 트리거(SQS 연결 $esm)" }
    }
}

# 상태 코드만 돌려준다. 4xx/5xx 도 예외가 아니라 숫자로 받는다. 연결 자체가 안 되면 $null.
function Get-HttpStatus([string]$Uri) {
    try { return [int](Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop).StatusCode }
    catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return $null
    }
}

# 클러스터와 상관없이 계정에 걸린 것 (destroy 된 저녁에도 의미가 있다). 읽기만 한다.
function Test-AccountGuards {
    Step "확인" "계정 (SES · Jenkins)"
    # 2026-09-11: queuing.kr 도메인 인증과 DKIM 레코드가 손으로 지워져 메일이 전부 실패했다.
    #             destroy 와는 무관하다. 누가 지우면 여기서만 드러난다.
    $v = Read-Native "aws" @("sesv2", "get-email-identity", "--region", $Region, "--email-identity", $SesDomain, "--query", "[VerifiedForSendingStatus,DkimAttributes.Status]", "--output", "text")
    if ($script:ReadExit -ne 0 -or -not $v) { Warn "SES $SesDomain 도메인 인증이 없다 - 메일 발송이 전부 실패한다 (도메인 인증은 찬규님 몫)" }
    elseif ("$v" -match "^True\s+SUCCESS") { Ok "SES $SesDomain 인증됨 (DKIM SUCCESS)" }
    else { Warn "SES $SesDomain 인증 미완료: $v" }
    $prod = Read-Native "aws" @("sesv2", "get-account", "--region", $Region, "--query", "ProductionAccessEnabled", "--output", "text")
    if ("$prod".Trim() -eq "True") { Ok "SES 프로덕션 액세스" } else { Info "SES 샌드박스 - 인증된 주소로만 발송된다 (해제 신청은 계정 대시보드)" }

    # 2026-09-11: tfvars 의 jenkins_allowed_cidr 가 주석이라 8080 이 인터넷 전체에 열려 있었다.
    $open = Read-Native "aws" @("ec2", "describe-security-groups", "--region", $Region, "--filters", "Name=group-name,Values=queuing-jenkins-*", "Name=ip-permission.from-port,Values=8080", "Name=ip-permission.cidr,Values=0.0.0.0/0", "--query", "length(SecurityGroups)", "--output", "text")
    if ($script:ReadExit -eq 0 -and "$open".Trim() -ne "0") { Warn "Jenkins 8080 이 인터넷 전체(0.0.0.0/0)에 열려 있다 - terraform.tfvars 의 jenkins_allowed_cidr 확인" }
    elseif ($script:ReadExit -eq 0) { Ok "Jenkins 8080 인터넷 전체 공개 아님" }
}

function Get-OrphanVolumes {
    $json = Read-Native "aws" @("ec2", "describe-volumes", "--region", $Region, "--filters", "Name=status,Values=available", "Name=tag:ebs.csi.aws.com/cluster-name,Values=$Cluster", "--output", "json")
    if ($script:ReadExit -ne 0 -or -not $json) { return @() }
    return @(($json | Out-String | ConvertFrom-Json).Volumes | ForEach-Object {
        $t = @{}; $_.Tags | ForEach-Object { $t[$_.Key] = $_.Value }
        [pscustomobject]@{ Id = $_.VolumeId; GB = $_.Size; Pvc = "$($t['kubernetes.io/created-for/pvc/namespace'])/$($t['kubernetes.io/created-for/pvc/name'])"; Created = $_.CreateTime }
    })
}

function Test-FlowLogGroupLeftover {
    $g = Read-Native "aws" @("logs", "describe-log-groups", "--region", $Region, "--log-group-name-prefix", $FlowLogGroup, "--query", "logGroups[].logGroupName", "--output", "text")
    if (-not ($g -split "\s+" | Where-Object { $_ -eq $FlowLogGroup })) { return $false }
    $inState = (Read-Native "terraform" @("-chdir=$TfDir", "state", "list")) | Where-Object { $_ -like "aws_cloudwatch_log_group.flow_logs*" }
    return (-not $inState)
}

function Assert-Tools {
    foreach ($t in @("aws", "terraform", "kubectl", "helm", "git")) {
        if (-not (Get-Command $t -ErrorAction SilentlyContinue)) { Die "$t 을(를) 찾을 수 없다" }
    }
    if (-not (Test-Path $TfDir)) { Die "terraform 폴더가 없다: $TfDir" }
    if (-not (Test-Path $Work)) { New-Item -ItemType Directory -Path $Work | Out-Null }
}

function Connect-Cluster {
    if (-not (Invoke-Native "kubeconfig 갱신" "aws" @("eks", "update-kubeconfig", "--region", $Region, "--name", $Cluster))) { Die "클러스터에 연결하지 못했다" }
    # 온프레미스 컨텍스트에 실행하면 잘 돌던 배포를 덮어쓴다. 반드시 확인한다.
    $ctx = Read-Native "kubectl" @("config", "current-context")
    if ($ctx -notlike "*$Cluster*") { Die "컨텍스트가 EKS 가 아니다: $ctx" }
    Ok "컨텍스트 $ctx"
}

function Write-Summary([string]$Title) {
    Write-Host "`n────────────────────────────────────────" -ForegroundColor Cyan
    if ($script:Warnings.Count) {
        Write-Host " $Title — 확인이 필요한 항목 $($script:Warnings.Count)개" -ForegroundColor Yellow
        $script:Warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    } else { Write-Host " $Title — 경고 없음" -ForegroundColor Green }
    if ($DryRun) { Write-Host " (dry-run: 실제로 바뀐 것은 없다)" -ForegroundColor Gray }
}

# ══════════════════════════════════════════════
# up
# ══════════════════════════════════════════════
function Invoke-Up {
    Assert-Tools
    $acct = (Read-Native "aws" @("sts", "get-caller-identity", "--query", "Account", "--output", "text"))
    if (-not $acct) { Die "AWS 자격 증명을 확인한다 (aws sts get-caller-identity 실패)" }
    Ok "AWS 계정 $acct"

    # ── 1. 비밀값 먼저 (apply 20분 뒤에 묻지 않도록) ──
    Step 1 "비밀값 (Secrets Manager $SecretId)"
    $store = Read-Store
    $script:StoreDirty = $false
    $S = @{
        Db        = Get-StoredSecret $store "DB_PASSWORD"             "D-Cloud DB 비밀번호"
        Redis     = Get-StoredSecret $store "REDIS_COUNTER_PASSWORD"  "D파트 Redis 비밀번호 (새로 정해도 된다)"
        Recap3    = Get-StoredSecret $store "RECAPTCHA_SECRET_KEY"    "reCAPTCHA v3 Secret Key (40자)" -Length 40
        Recap2    = Get-StoredSecret $store "RECAPTCHA_V2_SECRET_KEY" "reCAPTCHA v2 Secret Key (40자)" -Length 40
        JwtAuth   = Get-StoredSecret $store "JWT_AUTH_SECRET"         "" -Generate
        JwtAdmit  = Get-StoredSecret $store "JWT_SECRET"              "" -Generate
    }
    if ($script:StoreDirty) { Save-Store $store; Ok "저장 (다음부터 묻지 않는다)" } else { Ok "저장된 값 사용" }

    # ── 2. terraform ──
    if (-not $SkipTerraform) {
        Step 2 "terraform"
        # destroy 도중 Flow Logs 서비스가 로그 그룹을 다시 만든다 (2026-09-09, 09-10 두 번).
        # 남아 있으면 apply 가 ResourceAlreadyExistsException 으로 멈춘다. 비어 있는 그룹이다.
        if (Test-FlowLogGroupLeftover) {
            if (Invoke-Native "남은 Flow Log 로그 그룹 삭제" "aws" @("logs", "delete-log-group", "--region", $Region, "--log-group-name", $FlowLogGroup) -SkipInDryRun) { Ok "남은 로그 그룹 정리" }
        }
        # B파트 Lambda 는 apply 가 zip 과 ASL 을 읽으므로 먼저 만든다.
        if (-not (Build-BPartWorkflow)) { Die "B파트 Lambda 패키지를 만들지 못했다. 위 에러를 확인한다 (급하면 terraform.tfvars 에 b_resale_workflow = false 로 끄고 진행)" }
        # D-Cloud DB 비밀번호는 terraform 파일·tfvars 에 두지 않는다. 이 terraform 실행 동안만 환경변수로 넘기고 바로 지운다.
        $tfExit = 0
        # A↔B 콜백 공유 비밀값. Secrets Manager 에만 두고 tfvars·state 에는 넣지 않는다.
        $cbSecret = Read-Native "aws" @("secretsmanager", "get-secret-value", "--region", $Region, "--secret-id", "queuing-persistent/b-callback-secret", "--query", "SecretString", "--output", "text")
        if ($script:ReadExit -eq 0 -and "$cbSecret".Trim()) { $env:TF_VAR_b_callback_secret = "$cbSecret".Trim() }
        else { Warn "queuing-persistent/b-callback-secret 을 읽지 못했다 - B 콜백 API 가 X-Callback-Secret 검증에 실패한다" }
        $env:TF_VAR_b_lambda_db_password = $S.Db
        try {
            if ($DryRun) {
                Info "[dry-run] terraform plan"
                & terraform "-chdir=$TfDir" plan -input=false -no-color -compact-warnings | Select-String -CaseSensitive -Pattern "^Plan:|^No changes|^Error:" | ForEach-Object { Info $_.Line }
            } else {
                # 직접 호출한다. 출력을 가로채면 "Enter a value" 입력 안내가 화면에 안 보인다.
                & terraform "-chdir=$TfDir" apply
                $tfExit = $LASTEXITCODE
            }
        } finally { Remove-Item Env:TF_VAR_b_lambda_db_password, Env:TF_VAR_b_callback_secret -ErrorAction SilentlyContinue; $cbSecret = $null }
        if ($tfExit -ne 0) { Die "terraform apply 실패. 에러를 고친 뒤 다시 실행한다" }
    }

    # ── 3. 연결 ──
    Step 3 "클러스터 연결"
    Connect-Cluster
    if (-not (Invoke-Native "노드 Ready 대기" "kubectl" @("wait", "--for=condition=Ready", "nodes", "--all", "--timeout=600s"))) { Die "노드가 Ready 가 되지 않았다" }
    $tf = (Read-Native "terraform" @("-chdir=$TfDir", "output", "-json")) | Out-String | ConvertFrom-Json
    foreach ($k in @("redis_endpoint", "ses_send_role_arn")) {
        if (-not $tf.$k.value) { Die "terraform output $k 가 없다" }
    }
    Ok "ElastiCache $($tf.redis_endpoint.value)"

    # ── 4. 기반 (네임스페이스 · StorageClass · metrics-server) ──
    Step 4 "기반"
    $nsYaml = ($Namespaces | ForEach-Object { "apiVersion: v1`nkind: Namespace`nmetadata:`n  name: $_" }) -join "`n---`n"
    if (Kube "네임스페이스" @("apply", "-f", "-") $nsYaml) { Ok "네임스페이스 $($Namespaces.Count)개" }
    # A파트 차트가 Namespace 를 직접 정의해서, helm 소유 표시가 없으면 설치를 거부한다.
    [void](Kube "queuing-a helm 소유 라벨" @("label", "namespace", "queuing-a", "app.kubernetes.io/managed-by=Helm", "--overwrite"))
    [void](Kube "queuing-a helm 소유 어노테이션" @("annotate", "namespace", "queuing-a", "meta.helm.sh/release-name=api", "meta.helm.sh/release-namespace=queuing-a", "--overwrite"))
    if (Kube "StorageClass gp3" @("apply", "-f", "-") $StorageClassYaml) { Ok "StorageClass gp3 (default)" }
    # 버전을 고정한다. latest 는 날마다 다른 버전이 깔릴 수 있다.
    if (Kube "metrics-server" @("apply", "-f", "https://github.com/kubernetes-sigs/metrics-server/releases/download/$($Versions.MetricsServer)/components.yaml")) { Ok "metrics-server $($Versions.MetricsServer)" }

    # ── 5. Secret ──
    # 키 이름이 파트마다 다르다. 틀리면 환경변수가 조용히 비고 앱은 인증 실패만 남긴다.
    Step 5 "Secret"
    Set-K8sSecret "queuing-a"  "mariadb-credentials"    ([ordered]@{ MARIADB_ROOT_PASSWORD = $S.Db })
    Set-K8sSecret "queuing-a"  "auth-credentials"       ([ordered]@{ JWT_AUTH_SECRET = $S.JwtAuth; JWT_SECRET = $S.JwtAdmit })
    Set-K8sSecret "queuing-a"  "recaptcha-credentials"  ([ordered]@{ RECAPTCHA_SECRET_KEY = $S.Recap3; RECAPTCHA_V2_SECRET_KEY = $S.Recap2 })
    Set-K8sSecret "queuing-d"  "backend-counter-secret" ([ordered]@{ "db-password" = $S.Db; "redis-password" = $S.Redis })
    Set-K8sSecret "redis"      "redis-counter-secret"   ([ordered]@{ password = $S.Redis })
    Set-K8sSecret "realtime"   "stats-redis-secret"     ([ordered]@{ password = $S.Redis })
    # A파트 파드가 B 콜백을 부를 때 보내는 헤더 값. Lambda 쪽 B_CALLBACK_SECRET 과 같아야 한다.
    # 이 Secret 이 없으면 A 차트의 bCallbackAuth 때문에 파드가 뜨지 않는다 (2026-09-15 실제로 멈췄다).
    $cbk = Read-Native "aws" @("secretsmanager", "get-secret-value", "--region", $Region, "--secret-id", "queuing-persistent/b-callback-secret", "--query", "SecretString", "--output", "text")
    if ($script:ReadExit -eq 0 -and "$cbk".Trim()) { Set-K8sSecret "queuing-a" "b-callback-credentials" ([ordered]@{ B_CALLBACK_SECRET = "$cbk".Trim() }) }
    else { Warn "queuing-persistent/b-callback-secret 을 읽지 못했다 - A파트 파드가 뜨지 않는다" }
    $cbk = $null
    $S = $null

    # ── 6. 팀원 RBAC ──
    Step 6 "팀원 RBAC"
    if (Kube "팀원 RBAC" @("apply", "-f", "-") (Get-TeamRbacYaml $acct)) { Ok "chan · geonah · yeji" }

    # ── 7. 클러스터 공용 (모니터링 · 노드 자동 증설) — 앱보다 먼저 ──
    # 앱 차트의 ServiceMonitor(A·C·D파트)는 모니터링이 만드는 CRD 가 있어야 설치된다.
    # 2026-09-11 에 C파트가 모니터링보다 먼저 배포되어 업그레이드가 조용히 실패했다.
    # KEDA 는 B파트 email-worker 전용이라 2026-09-15 에 뺐다.
    Step 7 "모니터링 · Cluster Autoscaler"
    [void](Invoke-Native "helm repo add prometheus-community" "helm" @("repo", "add", "prometheus-community", "https://prometheus-community.github.io/helm-charts", "--force-update"))
    $mv = Join-Path $Work "monitoring-values.yaml"
    [IO.File]::WriteAllText($mv, $MonitoringValues, (New-Object System.Text.UTF8Encoding $false))
    if (Helm-Release "모니터링" "monitoring" "monitoring" "prometheus-community/kube-prometheus-stack" @("--version", $Versions.Monitoring, "-f", $mv)) { Ok "kube-prometheus-stack $($Versions.Monitoring)" }

    # 노드 자동 증설. Pending 파드가 생기면 노드그룹 ASG 의 desired 를 올리고, 10분 넘게 한가한 노드는 내린다.
    #   대상 ASG 를 이름으로 직접 준다 (--nodes=최소:최대:ASG). 태그 자동 탐색에 기대지 않는다.
    #   ASG 이름은 매일 바뀌어서 terraform 출력에서 읽는다. IAM 권한도 그 ASG 하나로만 묶여 있다.
    #   ServiceAccount 이름은 cluster_autoscaler.tf 의 신뢰 정책(kube-system:cluster-autoscaler)과 같아야 한다.
    $ca = $tf.cluster_autoscaler.value
    if (-not $ca) { Info "Cluster Autoscaler 건너뜀 (terraform 의 cluster_autoscaler_enabled = false)" }
    else {
        [void](Invoke-Native "helm repo add autoscaler" "helm" @("repo", "add", "autoscaler", "https://kubernetes.github.io/autoscaler", "--force-update"))
        if (Helm-Release "Cluster Autoscaler" "kube-system" "cluster-autoscaler" "autoscaler/cluster-autoscaler" @("--version", $Versions.ClusterAutoscaler,
                "--set", "cloudProvider=aws", "--set", "awsRegion=$Region",
                "--set", "autoscalingGroups[0].name=$($ca.asg_name)",
                "--set", "autoscalingGroups[0].minSize=$($ca.min_size)",
                "--set", "autoscalingGroups[0].maxSize=$($ca.max_size)",
                "--set", "fullnameOverride=cluster-autoscaler",
                "--set", "rbac.serviceAccount.name=cluster-autoscaler",
                "--set-string", "rbac.serviceAccount.annotations.eks\.amazonaws\.com/role-arn=$($ca.role_arn)",
                "--set", "resources.requests.cpu=50m", "--set", "resources.requests.memory=128Mi", "--set", "resources.limits.memory=384Mi") -Wait) {
            Ok "Cluster Autoscaler $($Versions.ClusterAutoscaler) (노드 $($ca.min_size)~$($ca.max_size)대, $($ca.asg_name))"
        }
    }

    # ── 8. 앱 차트 가져오기 ──
    Step 8 "앱 차트"
    [void](Invoke-Native "git fetch" "git" @("-C", $RepoDir, "fetch", "origin", "--quiet"))
    $charts = @{ a = Join-Path $Work "chart-a"; d = Join-Path $Work "chart-d" }
    $src = @{ a = @("origin/feature/chan", "redis-api-chart"); d = @("origin/yeji/aws-migration", "k8s/queuing-chart") }
    foreach ($p in @("a", "d")) {
        if ((Export-FromGit $src[$p][0] $src[$p][1] $charts[$p]) -and (Test-Path (Join-Path $charts[$p] "Chart.yaml"))) { Ok "$p <- $($src[$p][0]):$($src[$p][1])" }
        else { Warn "$p파트 차트를 꺼내지 못했다 ($($src[$p][0]):$($src[$p][1]))"; $charts[$p] = $null }
    }
    if (-not (Test-Path (Join-Path $ChartC "Chart.yaml"))) { Warn "C파트 차트가 없다: $ChartC"; $ChartC = $null }

    # ── 9. 배포 ──
    # --set 값은 차트 기본값을 덮는다. 누군가 --set 없이 upgrade 하면 조용히 되돌아간다.
    Step 9 "배포"
    $redisCounter = "redis-counter-master.redis.svc.cluster.local"

    # D (예지) — C파트 통계 채널이 이 Redis 를 구독하므로 C 보다 먼저.
    #   service.type=ClusterIP: 기본값 LoadBalancer 면 Classic LB 가 따로 생긴다 (월 $18, 인증 없는 공개).
   if ($charts.d -and (Helm-Release "D파트 counter" "queuing-d" "counter" $charts.d @(
            "--set", "service.type=NodePort", "--set", "service.nodePort=30083", "--set", "env.redisHost=$redisCounter"))) { Ok "D counter" }

    # C (지예) — 키 경로는 env.redisHost 다 (config.redisHost 로 주면 조용히 무시된다).
    if ($ChartC -and (Helm-Release "C파트 realtime-ws" "realtime" "realtime-ws" $ChartC @(
            "--set", "env.redisHost=$($tf.redis_endpoint.value)", "--set", "statsRedis.host=$redisCounter") -Wait)) { Ok "C realtime-ws" }

    # A (찬규) — www 포함 (SITE_URL 이 www 라 없으면 reCAPTCHA 403). 콤마는 \, 로 이스케이프.
    #   SES 발송 IRSA 는 차트의 serviceAccount.annotations 로 넣는다 (설치 후 재시작 불필요).
    $aArgs = @(
        "--set", "recaptcha.allowedHostnames=queuing.kr\,www.queuing.kr",
        "--set-string", "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=$($tf.ses_send_role_arn.value)")
    # B파트 콜백 API 주소. terraform 이 콜백 Lambda 를 만들었을 때만 값이 있다.
    if ($tf.b_callback_base_url.value) { $aArgs += @("--set", "env.bCallbackBaseUrl=$($tf.b_callback_base_url.value)") }
    # 좌석 취소 이벤트를 보낼 SQS 큐 주소 (건아님 큐). 없으면 A 가 DB outbox 에만 쌓는다.
    if ($tf.cancellation_events_queue_url.value) { $aArgs += @("--set", "env.cancellationEventsQueueUrl=$($tf.cancellation_events_queue_url.value)") }
    if ($charts.a -and (Helm-Release "A파트 api" "queuing-a" "api" $charts.a $aArgs -Wait)) { Ok "A api" }

    # B (건아) — email-worker 는 Step Functions 워크플로로 대체되어 배포하지 않는다 (2026-09-15 건아님 확인)

    Show-Health -WaitSeconds 180
    Test-AccountGuards
    Write-Summary "up"
    $promUrl = if ($tf.yeji_prometheus_url.value) { $tf.yeji_prometheus_url.value } else { "(연결 꺼짐)" }
    Write-Host @"

 매일 확인할 것
   - JWT 키는 저장소 값을 계속 쓴다. 로그인 세션은 클러스터가 다시 떠도 유지된다.
   - 예지님 Grafana 의 Prometheus 데이터소스: $promUrl
   - 내리기 전에: .\queuing-aws.ps1 down
"@ -ForegroundColor Gray
}

# ══════════════════════════════════════════════
# down
# ══════════════════════════════════════════════
function Invoke-Down {
    Assert-Tools
    if (-not $DryRun) {
        Write-Host "`n  클러스터·ALB·CloudFront·ElastiCache·S3·Jenkins 를 모두 지운다." -ForegroundColor Yellow
        Write-Host "  (남는 것: NAT EIP, SES 도메인 인증, Route53 영역, 예지님 Grafana EC2, 이 PC 의 비밀값 저장소)" -ForegroundColor Yellow
        if ((Read-Host "  계속하려면 destroy 를 입력") -ne "destroy") { Die "취소했다" }
    }
    Info "Prometheus 지표는 볼륨과 함께 사라진다. Grafana(예지님 EC2)와 CloudWatch 지표는 남는다."

    # ── 1. Flow Log 먼저 ──
    # 로그를 쓰는 주체를 먼저 지워야 destroy 도중 로그 그룹이 다시 생기지 않는다.
    Step 1 "Flow Log 먼저 제거"
    if ($DryRun) {
        & terraform "-chdir=$TfDir" plan -destroy -input=false -no-color "-target=aws_flow_log.vpc" | Select-String -CaseSensitive -Pattern "^Plan:|^No changes|^Error:" | ForEach-Object { Info "[dry-run] $($_.Line)" }
    } else {
        & terraform "-chdir=$TfDir" destroy "-target=aws_flow_log.vpc" -auto-approve
        if ($LASTEXITCODE -ne 0) { Die "Flow Log destroy 실패" }
    }

    # ── 2. 전체 ──
    Step 2 "전체 destroy (terraform 이 yes 를 한 번 더 묻는다)"
    if ($DryRun) {
        & terraform "-chdir=$TfDir" plan -destroy -input=false -no-color | Select-String -CaseSensitive -Pattern "^Plan:|^No changes|^Error:" | ForEach-Object { Info "[dry-run] $($_.Line)" }
    } else {
        & terraform "-chdir=$TfDir" destroy
        if ($LASTEXITCODE -ne 0) { Die "terraform destroy 실패. 에러를 고친 뒤 다시 실행한다" }
    }

    # ── 3. 찌꺼기 ──
    Step 3 "남은 찌꺼기"
    if (-not $DryRun -and (Test-FlowLogGroupLeftover)) {
        if (Invoke-Native "로그 그룹 삭제" "aws" @("logs", "delete-log-group", "--region", $Region, "--log-group-name", $FlowLogGroup)) { Ok "다시 생긴 Flow Log 로그 그룹 삭제" }
    }
    # PVC 가 쓰던 EBS 는 클러스터가 지워져도 남아서 매일 쌓인다 (하루 약 20GB).
    $vols = Get-OrphanVolumes
    if ($vols.Count) {
        $gb = ($vols | Measure-Object GB -Sum).Sum
        Info "클러스터가 남긴 EBS $($vols.Count)개, 합계 ${gb}GB"
        $vols | ForEach-Object { Info ("  {0}  {1,3}GB  {2}" -f $_.Id, $_.GB, $_.Pvc) }
        if ($DryRun) { Info "[dry-run] 삭제 건너뜀" }
        elseif ((Read-Host "  이 볼륨들을 지울까? 되돌릴 수 없다 (y/N)") -eq "y") {
            foreach ($v in $vols) { [void](Invoke-Native "볼륨 $($v.Id) 삭제" "aws" @("ec2", "delete-volume", "--region", $Region, "--volume-id", $v.Id)) }
            Ok "EBS 정리"
        } else { Info "남겨뒀다" }
    } else { Ok "남은 EBS 없음" }

    Write-Summary "down"
    Write-Host "`n 내일 아침: .\queuing-aws.ps1 up" -ForegroundColor Gray
}

# ══════════════════════════════════════════════
# status
# ══════════════════════════════════════════════
function Invoke-Status {
    Assert-Tools
    Step "상태" "AWS"
    $c = Read-Native "aws" @("eks", "describe-cluster", "--region", $Region, "--name", $Cluster, "--query", "cluster.status", "--output", "text")
    if (-not $c) { Info "EKS 클러스터 없음 (destroy 된 상태)" }
    else {
        Ok "EKS $c"
        Connect-Cluster
        $nodes = @(Read-Native "kubectl" @("get", "nodes", "--no-headers"))
        Info "노드 $($nodes.Count)대"
        Show-Health
    }
    Test-AccountGuards
    if (Test-FlowLogGroupLeftover) { Warn "state 밖에 Flow Log 로그 그룹이 남아 있다 - up 이 자동으로 지운다" }
    $vols = Get-OrphanVolumes
    if ($vols.Count) { Info "클러스터가 남긴 EBS $($vols.Count)개 ($(($vols | Measure-Object GB -Sum).Sum)GB)" }
    $sid = Read-Native "aws" @("secretsmanager", "list-secrets", "--region", $Region, "--filters", "Key=name,Values=$SecretId", "--query", "length(SecretList)", "--output", "text")
    Info "비밀값 저장소: $(if ($script:ReadExit -eq 0 -and "$sid".Trim() -ne '0') { "Secrets Manager $SecretId" } else { '없음 (up 이 처음 한 번 묻고 Secrets Manager 에 만든다)' })"
}

switch ($Action) {
    "up"     { Invoke-Up }
    "down"   { Invoke-Down }
    "status" { Invoke-Status }
}
