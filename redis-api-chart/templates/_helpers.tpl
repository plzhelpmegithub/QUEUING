{{/*
=============================================================================
 헬퍼 템플릿 — 차트 전반에서 재사용되는 이름/라벨 생성 함수.
 다른 템플릿에서 {{ include "redis-api-chart.xxx" . }} 형태로 호출.
=============================================================================
*/}}

{{/*
[차트 이름] .Chart.Name 또는 nameOverride 값을 사용.
K8s 리소스 이름은 63자 제한(DNS 명명 규칙)이 있으므로 잘라냄.
*/}}
{{- define "redis-api-chart.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
[풀네임] 릴리즈 이름 + 차트 이름을 조합한 고유 리소스 이름.
fullnameOverride가 설정되어 있으면 그걸 사용.
릴리즈 이름에 차트 이름이 이미 포함되어 있으면 중복 방지.
예: helm install my-api redis-api-chart → "my-api-redis-api-chart"
*/}}
{{- define "redis-api-chart.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
[차트 라벨] helm.sh/chart 라벨에 사용되는 "차트이름-버전" 문자열.
*/}}
{{- define "redis-api-chart.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
[공통 라벨] 모든 리소스에 붙는 표준 라벨 세트.
헬름 관리 추적, 버전 식별, 셀렉터 매칭 등에 사용.
*/}}
{{- define "redis-api-chart.labels" -}}
helm.sh/chart: {{ include "redis-api-chart.chart" . }}
{{ include "redis-api-chart.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
[셀렉터 라벨] Service → Pod 매칭에 사용되는 최소 라벨.
Deployment의 selector.matchLabels와 동일해야 함.
*/}}
{{- define "redis-api-chart.selectorLabels" -}}
app.kubernetes.io/name: {{ include "redis-api-chart.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
[서비스 어카운트 이름] SA 생성이 활성화되면 fullname 기반,
비활성화면 name 필드 또는 "default" 사용.
*/}}
{{- define "redis-api-chart.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "redis-api-chart.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
