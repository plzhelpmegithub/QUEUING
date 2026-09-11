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
#       NAT EIP 54.116.100.145, SES queuing.kr 도메인 인증, Route53 호스팅 영역
#
# ■ 2026-09-10~11 에 실제로 겪은 문제와 이 파일의 대응
#   외부 명령 실패가 "OK" 로 찍힘   -> 모든 kubectl/helm/aws 호출의 종료 코드를 확인한다
#   C파트 업그레이드가 조용히 실패   -> 모니터링(ServiceMonitor CRD)을 앱보다 먼저 설치한다
#   D파트 차트 경로 한 겹 남음      -> "브랜치:경로" zip 으로 받아 벗겨낼 필요 자체를 없앴다
#   한글 파일명 추출 실패            -> tar 대신 zip (dry-run 으로 발견)
#   KEDA/워커 IRSA 누락             -> KEDA·A파트는 helm 값으로, 워커는 설치 직후 붙인다
#   Flow Log 로그 그룹 재생성        -> down 에서 Flow Log 먼저 지우고, up 전에 남은 그룹을 정리한다
#   reCAPTCHA 키 붙여넣기 오류       -> 40자인지 검사하고 틀리면 다시 묻는다
#   Role 이 네임스페이스 자체를 지움 -> RBAC 에서 namespaces 를 빼고 그룹을 열거한다
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
# 외부 프로그램 표준입력으로 넘기는 텍스트(kubectl apply -f -)를 UTF-8 로 보낸다.
# PowerShell 5.1 기본값은 ASCII 라서 한글이 ? 로 바뀐다.
$OutputEncoding = New-Object System.Text.UTF8Encoding $false

$TfDir   = Join-Path $RepoDir "terraform-final"
$ChartC  = Join-Path $RepoDir "realtime-ws\helm-chart\realtime-ws-chart"
$Work    = Join-Path $env:TEMP "queuing-aws"
$script:Warnings = New-Object System.Collections.Generic.List[string]

# ══════════════════════════════════════════════
# 고정값 — 바꿀 일이 생기면 여기만 고친다
# ══════════════════════════════════════════════
$Versions = @{
    Keda          = "2.20.2"
    Monitoring    = "88.6.0"   # 릴리즈 이름 monitoring 과 함께 고정 (ServiceMonitor 선택 라벨)
    MetricsServer = "v0.9.0"
}
$Namespaces = @("queuing-a", "queuing-b", "queuing-c", "queuing-d", "realtime", "redis", "monitoring", "keda", "argocd")
$FlowLogGroup = "/aws/vpc-flow-logs/queuing"
$Endpoints = @("https://api.queuing.kr/health", "https://api.queuing.kr/healthz", "https://queuing.kr/events")

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
    $ErrorActionPreference = "Continue"
    try {
        if ($PSBoundParameters.ContainsKey("InputText")) { $out = $InputText | & $Exe @a }
        else { $out = & $Exe @a }
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $old }

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
function Read-Native([string]$Exe, [string[]]$ArgList) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { $o = & $Exe @ArgList 2>$null; $script:ReadExit = $LASTEXITCODE; return $o }
    finally { $ErrorActionPreference = $old }
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
# 비밀값 저장소 (이 PC, DPAPI)
# ══════════════════════════════════════════════
function Get-Plain([Security.SecureString]$s) {
    return (New-Object System.Management.Automation.PSCredential("x", $s)).GetNetworkCredential().Password
}

function Read-Store {
    if (Test-Path $SecretStore) { $s = Import-Clixml -Path $SecretStore } else { $s = @{} }
    foreach ($k in $ResetSecret) {
        if ($k -eq "all") { $s = @{}; break }
        if ($s.ContainsKey($k)) { $s.Remove($k) }
    }
    return $s
}

function Save-Store($Store) {
    if ($DryRun) { Info "[dry-run] 비밀값 저장 건너뜀"; return }
    $dir = Split-Path $SecretStore
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $Store | Export-Clixml -Path $SecretStore
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
        "discovery.k8s.io", "events.k8s.io", "coordination.k8s.io", "monitoring.coreos.com", "keda.sh", "argoproj.io")

    $docs = New-Object System.Collections.Generic.List[string]
    foreach ($m in $Team) {
        $u = $m.User
        $arn = "arn:aws:iam::${AccountId}:user/$u"
        $extra = ""
        # A파트 차트의 templates/namespace.yaml 때문에 helm 이 Namespace 라벨을 써야 한다. 삭제는 주지 않는다.
        if ($u -eq "chan") {
            $extra = "`n  - apiGroups: [`"`"]`n    resources: [`"namespaces`"]`n    resourceNames: [`"queuing-a`"]`n    verbs: [`"patch`", `"update`"]"
        }
        if ($u -eq "geonah") {
            $extra = "`n  - apiGroups: [`"keda.sh`"]`n    resources: [`"*`"]`n    verbs: [`"get`", `"list`", `"watch`"]"
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

# kube-prometheus-stack 값. 비밀번호는 넣지 않는다 (grafana-admin Secret 참조).
# 전부 ClusterIP — Prometheus 는 인증이 없어서 외부에 열면 내부 정보가 다 보인다.
$MonitoringValues = @"
grafana:
  enabled: true
  admin:
    existingSecret: grafana-admin
    userKey: admin-user
    passwordKey: admin-password
  persistence:
    enabled: true
    size: 5Gi
  deploymentStrategy:
    type: Recreate
  service:
    type: ClusterIP
    port: 80
prometheus:
  service:
    type: ClusterIP
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
    foreach ($r in @("keda", "monitoring", "counter", "realtime-ws", "api", "worker")) {
        if ($names -notcontains $r) { Warn "helm 릴리즈 없음: $r" }
    }

    foreach ($u in $Endpoints) {
        try {
            $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
            Ok "$u -> $($r.StatusCode)"
        } catch {
            $code = $null
            if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
            Warn "$u -> $(if ($code) { $code } else { '연결 실패' })"
        }
    }
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
    Step 1 "비밀값 ($SecretStore)"
    $store = Read-Store
    $script:StoreDirty = $false
    $S = @{
        Db        = Get-StoredSecret $store "DB_PASSWORD"             "D-Cloud DB 비밀번호"
        Redis     = Get-StoredSecret $store "REDIS_COUNTER_PASSWORD"  "D파트 Redis 비밀번호 (새로 정해도 된다)"
        Recap3    = Get-StoredSecret $store "RECAPTCHA_SECRET_KEY"    "reCAPTCHA v3 Secret Key (40자)" -Length 40
        Recap2    = Get-StoredSecret $store "RECAPTCHA_V2_SECRET_KEY" "reCAPTCHA v2 Secret Key (40자)" -Length 40
        Grafana   = Get-StoredSecret $store "GRAFANA_ADMIN_PASSWORD"  "Grafana 관리자 비밀번호"
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
        if ($DryRun) {
            Info "[dry-run] terraform plan"
            & terraform "-chdir=$TfDir" plan -input=false -no-color -compact-warnings | Select-String -CaseSensitive -Pattern "^Plan:|^No changes|^Error:" | ForEach-Object { Info $_.Line }
        } else {
            # 직접 호출한다. 출력을 가로채면 "Enter a value" 입력 안내가 화면에 안 보인다.
            & terraform "-chdir=$TfDir" apply
            if ($LASTEXITCODE -ne 0) { Die "terraform apply 실패. 에러를 고친 뒤 다시 실행한다" }
        }
    }

    # ── 3. 연결 ──
    Step 3 "클러스터 연결"
    Connect-Cluster
    if (-not (Invoke-Native "노드 Ready 대기" "kubectl" @("wait", "--for=condition=Ready", "nodes", "--all", "--timeout=600s"))) { Die "노드가 Ready 가 되지 않았다" }
    $tf = (Read-Native "terraform" @("-chdir=$TfDir", "output", "-json")) | Out-String | ConvertFrom-Json
    foreach ($k in @("redis_endpoint", "sqs_queue_url", "keda_role_arn", "worker_b_role_arn", "ses_send_role_arn")) {
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
    Set-K8sSecret "queuing-b"  "mysql-secret"           ([ordered]@{ password = $S.Db })
    Set-K8sSecret "queuing-d"  "backend-counter-secret" ([ordered]@{ "db-password" = $S.Db; "redis-password" = $S.Redis })
    Set-K8sSecret "redis"      "redis-counter-secret"   ([ordered]@{ password = $S.Redis })
    Set-K8sSecret "realtime"   "stats-redis-secret"     ([ordered]@{ password = $S.Redis })
    Set-K8sSecret "monitoring" "grafana-admin"          ([ordered]@{ "admin-user" = "admin"; "admin-password" = $S.Grafana })
    $S = $null

    # ── 6. 팀원 RBAC ──
    Step 6 "팀원 RBAC"
    if (Kube "팀원 RBAC" @("apply", "-f", "-") (Get-TeamRbacYaml $acct)) { Ok "chan · geonah · yeji" }

    # ── 7. 클러스터 공용 (KEDA · 모니터링) — 앱보다 먼저 ──
    # 앱 차트의 ServiceMonitor(C·D파트)와 ScaledObject(B파트)는 이 둘이 만드는 CRD 가 있어야 설치된다.
    # 2026-09-11 에 C파트가 모니터링보다 먼저 배포되어 업그레이드가 조용히 실패했다.
    Step 7 "KEDA · 모니터링"
    [void](Invoke-Native "helm repo add kedacore" "helm" @("repo", "add", "kedacore", "https://kedacore.github.io/charts", "--force-update"))
    [void](Invoke-Native "helm repo add prometheus-community" "helm" @("repo", "add", "prometheus-community", "https://prometheus-community.github.io/helm-charts", "--force-update"))
    # KEDA 오퍼레이터 IRSA 를 설치할 때 넣는다. identityOwner=operator 라서 오퍼레이터 신분으로 SQS 를 읽는다.
    if (Helm-Release "KEDA" "keda" "keda" "kedacore/keda" @("--version", $Versions.Keda,
            "--set-string", "serviceAccount.operator.annotations.eks\.amazonaws\.com/role-arn=$($tf.keda_role_arn.value)") -Wait) { Ok "KEDA $($Versions.Keda)" }
    $mv = Join-Path $Work "monitoring-values.yaml"
    [IO.File]::WriteAllText($mv, $MonitoringValues, (New-Object System.Text.UTF8Encoding $false))
    if (Helm-Release "모니터링" "monitoring" "monitoring" "prometheus-community/kube-prometheus-stack" @("--version", $Versions.Monitoring, "-f", $mv)) { Ok "kube-prometheus-stack $($Versions.Monitoring)" }

    # ── 8. 앱 차트 가져오기 ──
    Step 8 "앱 차트"
    [void](Invoke-Native "git fetch" "git" @("-C", $RepoDir, "fetch", "origin", "--quiet"))
    $charts = @{ a = Join-Path $Work "chart-a"; b = Join-Path $Work "chart-b"; d = Join-Path $Work "chart-d" }
    $src = @{ a = @("origin/feature/chan", "redis-api-chart"); b = @("origin/feature/geonah", "queuing-chart"); d = @("origin/yeji/aws-migration", "k8s/queuing-chart") }
    foreach ($p in @("a", "b", "d")) {
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
            "--set", "service.type=ClusterIP", "--set", "env.redisHost=$redisCounter"))) { Ok "D counter" }

    # C (지예) — 키 경로는 env.redisHost 다 (config.redisHost 로 주면 조용히 무시된다).
    if ($ChartC -and (Helm-Release "C파트 realtime-ws" "realtime" "realtime-ws" $ChartC @(
            "--set", "env.redisHost=$($tf.redis_endpoint.value)", "--set", "statsRedis.host=$redisCounter") -Wait)) { Ok "C realtime-ws" }

    # A (찬규) — www 포함 (SITE_URL 이 www 라 없으면 reCAPTCHA 403). 콤마는 \, 로 이스케이프.
    #   SES 발송 IRSA 는 차트의 serviceAccount.annotations 로 넣는다 (설치 후 재시작 불필요).
    if ($charts.a -and (Helm-Release "A파트 api" "queuing-a" "api" $charts.a @(
            "--set", "recaptcha.allowedHostnames=queuing.kr\,www.queuing.kr",
            "--set-string", "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=$($tf.ses_send_role_arn.value)") -Wait)) { Ok "A api" }

    # B (건아) — 차트가 ServiceAccount 어노테이션을 받지 않아서 설치 후 붙인다.
    #   차트 주석: "대장님이 IRSA 어노테이션을 나중에 덮어씌워 주실 겁니다"
    if ($charts.b -and (Helm-Release "B파트 worker" "queuing-b" "worker" $charts.b @(
            "--set", "aws.queueURL=$($tf.sqs_queue_url.value)", "--set", "aws.region=$Region", "--set", "keda.identityOwner=operator"))) {
        if (Kube "email-worker IRSA" @("-n", "queuing-b", "annotate", "serviceaccount", "email-worker", "eks.amazonaws.com/role-arn=$($tf.worker_b_role_arn.value)", "--overwrite")) {
            # IRSA 는 파드 생성 시점에 붙는다. 큐가 비어 0개면 아무 일도 없고, 나중에 뜨는 파드는 자동으로 받는다.
            [void](Invoke-Native "email-worker 재시작" "kubectl" @("-n", "queuing-b", "rollout", "restart", "deploy", "email-worker") -SkipInDryRun)
            Ok "B worker (+IRSA)"
        }
    }

    Show-Health -WaitSeconds 180
    Write-Summary "up"
    Write-Host @"

 매일 확인할 것
   - JWT 키는 저장소 값을 계속 쓴다. 로그인 세션은 클러스터가 다시 떠도 유지된다.
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
        Write-Host "  (남는 것: NAT EIP, SES 도메인 인증, Route53 영역, 이 PC 의 비밀값 저장소)" -ForegroundColor Yellow
        if ((Read-Host "  계속하려면 destroy 를 입력") -ne "destroy") { Die "취소했다" }
    }
    Info "Grafana 대시보드는 볼륨과 함께 사라진다. 백업이 필요한 파트는 지금 해야 한다."

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
    if (Test-FlowLogGroupLeftover) { Warn "state 밖에 Flow Log 로그 그룹이 남아 있다 - up 이 자동으로 지운다" }
    $vols = Get-OrphanVolumes
    if ($vols.Count) { Info "클러스터가 남긴 EBS $($vols.Count)개 ($(($vols | Measure-Object GB -Sum).Sum)GB)" }
    Info "비밀값 저장소: $(if (Test-Path $SecretStore) { '있음' } else { '없음 (up 이 처음 한 번 묻는다)' })"
    Write-Summary "status"
}

switch ($Action) {
    "up"     { Invoke-Up }
    "down"   { Invoke-Down }
    "status" { Invoke-Status }
}
