# 노드 설정 — 클러스터 밖에서 손으로 해야 하는 것들

매니페스트로 표현할 수 없어서 각 노드에 직접 적용해야 하는 설정을 모아둔다.
클러스터를 새로 만들거나 노드를 추가할 때 이 문서를 따라간다.

대상: `master(192.168.0.192)` / `worker1(192.168.0.194)` / `worker2(192.168.0.195)`

---

## 1. IPv6 비활성화 — 이미지 pull 실패 방지

### 증상

파드가 `Init:0/1` 또는 `ContainerCreating` 에서 멈추고, `kubectl describe` 에는
`Scheduled` 이벤트 하나만 보인다. kubelet 로그를 봐야 진짜 원인이 나온다.

```
E PullImage from image service failed
  err="failed to pull and unpack image \"docker.io/library/busybox:1.38.0\":
       failed to copy: ... dial tcp [2600:9000:21e0:3800:...]:443:
       connect: network is unreachable"
```

### 원인

노드에 IPv6 가 커널 수준에서 켜져 있지만 인터넷으로 나가는 IPv6 경로가 없다.
링크로컬(`fe80::/64`)만 있고 default 경로가 없는 상태다.

```bash
ip -6 route        # fe80::/64 만 잔뜩, default 없음
```

Docker Hub 의 blob 은 CloudFront 에서 받아오는데 그 도메인에 AAAA 레코드가 있다.
containerd 는 Go 로 작성되어 glibc 대신 자체 DNS 구현을 쓰기 때문에 A/AAAA 를
모두 조회하고 IPv6 를 시도하다 실패한다.

주의: `getent ahosts` 로는 IPv4 만 보인다. glibc 는 IPv6 경로가 없으면 AAAA 를
걸러주기 때문이다. **그래서 손으로 확인하면 멀쩡해 보이는데 pull 만 실패한다.**

```bash
getent ahosts production.cloudfront.docker.com   # IPv4 만 나옴 — 함정
```

### 적용 (모든 노드)

```bash
sudo sysctl -w net.ipv6.conf.all.disable_ipv6=1 net.ipv6.conf.default.disable_ipv6=1

printf "net.ipv6.conf.all.disable_ipv6=1\nnet.ipv6.conf.default.disable_ipv6=1\n" \
  | sudo tee /etc/sysctl.d/99-disable-ipv6.conf
sudo sysctl --system
```

### 확인

```bash
sudo crictl pull docker.io/library/busybox:1.38.0
```

`sysctl` 만으로 안 되면 containerd 재시작이 필요하다. Go 는 프로세스 시작 시
IPv6 지원 여부를 한 번만 확인하고 기억하기 때문이다.

```bash
sudo systemctl restart containerd     # ⚠️ 해당 노드의 모든 컨테이너가 재시작된다
```

### 왜 꺼도 되는가

이 클러스터는 전 구간이 IPv4 다.

| 구간 | 대역 |
| --- | --- |
| 노드 | `192.168.0.192/194/195` |
| 파드 (Calico) | `10.244.0.0/16` |
| 서비스 | ClusterIP IPv4 |
| D-Cloud DB | `211.46.52.164` |
| AWS 이관 계획 | VPC `10.0.0.0/16` |

IPv6 를 쓰는 구간이 없으므로 꺼도 잃는 기능이 없다.

### 발견 경위

2026-09-08, Grafana 파드가 안 떠서 추적하다 발견했다. 그전까지는 필요한 이미지가
전부 노드에 캐시되어 있어 드러나지 않았다. **새 이미지를 처음 받는 순간 터지는
종류의 문제**라, Jenkins 로 새 이미지를 빌드하거나 부하 테스트 중 스케일아웃으로
새 노드에 파드가 뜰 때 절반이 실패했을 것이다.

---

## 2. 디스크 여유 확보

`etcd` 는 디스크 쓰기 지연에 민감하다. 마스터 디스크가 차면 `helm upgrade` 같은
작업이 `etcdserver: request timed out` 으로 실패한다. 사용률이 85% 를 넘으면
kubelet 이 `DiskPressure` 로 파드를 퇴출하기 시작한다.

```bash
df -h /
```

Jenkins 가 마스터에서 도커로 돌기 때문에 빌드할 때마다 이미지가 쌓인다.
이미 Docker Hub 로 푸시했다면 로컬 사본은 필요 없다.

```bash
docker system df
docker image prune -af --filter "until=48h"
sudo crictl rmi --prune
df -h /
```

70% 아래를 목표로 한다.

---

## 3. 부하가 높을 때 피해야 할 작업

`uptime` 의 load average 가 높으면 etcd 가 느려져서 다음 작업이 실패한다.

- `helm upgrade` (특히 pre-upgrade 훅이 있는 kube-prometheus-stack)
- 대량 파드 재시작

```bash
uptime        # load average 가 코어 수(2)의 두 배를 넘으면 기다린다
```

2026-09-08 에 load 가 15.87 일 때 `helm upgrade` 가
`etcdserver: request timed out` 으로 실패했고, 2.19 로 떨어진 뒤 재시도해서
바로 성공했다.
