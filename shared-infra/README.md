# shared-infra — MariaDB + LocalStack을 지예님 클러스터로 통합

찬규님(A)/건아님(B)이 각자 PC에 두고 쓰던 MariaDB(`queuing_db`)와 LocalStack을
지예님 클러스터 안으로 옮기기 위한 매니페스트. Redis는 이미 클러스터 안에 있으므로
(`redis-master.realtime.svc.cluster.local`) 여기 포함 안 함.

## VM에서 순서대로 할 일

### 1. 기존 데이터 백업 (필요한 경우만)

지금 MariaDB에 남겨야 할 테스트 데이터가 있으면, 그 DB가 떠 있는 곳(VM3 등)에서:

```bash
mysqldump -h <기존 DB_HOST> -u root -p queuing_db > queuing_db_backup.sql
```

테스트 데이터라 안 옮겨도 되면 이 단계는 건너뛰어도 됨 — 찬규님 앱이 시작할 때
`initTable()`로 테이블 9개를 자동 생성하므로 빈 DB로 시작해도 정상 동작함.

### 2. MariaDB Secret 생성 (YAML엔 비밀번호를 안 넣음)

```bash
kubectl create namespace queuing-db
kubectl create secret generic mariadb-credentials -n queuing-db \
  --from-literal=MARIADB_ROOT_PASSWORD='<직접 정한 비밀번호로 교체>' \
  --from-literal=MARIADB_DATABASE=queuing_db
```

### 3. 스토리지클래스 확인

```bash
kubectl get storageclass
```

결과가 비어있으면(온프레미스 kubeadm 클러스터에 흔함) `mariadb.yaml` 맨 아래
주석에 있는 hostPath 방식 PV를 대신 써야 함 — 적용 전에 파일 다시 봐주세요.

### 4. 배포

```bash
kubectl apply -f mariadb.yaml
kubectl apply -f localstack.yaml
```

### 5. 확인

```bash
kubectl get pods -n queuing-db -w        # STATUS가 Running 될 때까지 대기
kubectl get pods -n queuing-localstack -w

# MariaDB 접속 테스트 (클러스터 안에서)
kubectl run -it --rm mysql-test --image=mariadb:11 --restart=Never -- \
  mysql -h mariadb.queuing-db.svc.cluster.local -u root -p queuing_db

# LocalStack 헬스체크
kubectl port-forward -n queuing-localstack svc/localstack 4566:4566
# 다른 터미널에서:
curl http://localhost:4566/_localstack/health
```

### 6. 백업했다면 새 DB로 복원

```bash
kubectl port-forward -n queuing-db svc/mariadb 3306:3306
# 다른 터미널에서:
mysql -h 127.0.0.1 -u root -p queuing_db < queuing_db_backup.sql
```

## 팀원에게 전달할 새 연결 정보

| 대상 | 기존 값 | 새 값 (환경변수로 주입) |
|---|---|---|
| 찬규님 `DB_HOST` | `localhost` (또는 VM3 주소) | `mariadb.queuing-db.svc.cluster.local` |
| 찬규님 `DB_PORT` | `3306` | `3306` (동일) |
| 찬규님 `DB_PASSWORD` | (비어있음) | 2단계에서 정한 비밀번호 |
| 건아님 `MYSQL_HOST` | `host.minikube.internal` | `mariadb.queuing-db.svc.cluster.local` |
| 찬규님 `AWS_ENDPOINT` | `http://192.168.0.191:4566` | `http://localstack.queuing-localstack.svc.cluster.local:4566` |
| 건아님 `AWS_ENDPOINT_URL` | `http://localstack-service.default.svc.cluster.local:4566` | `http://localstack.queuing-localstack.svc.cluster.local:4566` |

**둘 다 이미 앱 코드가 환경변수로 값을 받게 되어있어서, 코드 수정은 필요 없고
위 표의 새 값을 각자 Deployment(또는 예지님 Helm values.yaml)의 env로 넣어주기만
하면 돼요.**

## 주의 — D-Cloud와 헷갈리지 마세요

이 `queuing_db`는 팀이 개발 중 자체적으로 띄운 DB이고, 더존비즈온이 지급한
**D-Cloud(211.46.52.164) MariaDB와는 다른 별개의 DB**예요. D-Cloud는 손대지
않고 그대로 둡니다 — 이번 통합 대상이 아님.
