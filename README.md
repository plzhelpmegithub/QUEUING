# QUEUING
CLoudDX 7기 팀 프로젝트 협업 공간. 
QUEUING이라는 사전 예약/예매 플랫폼 제작이며 대기열을 통해 순차적으로 서버에 들어가고 오토 스케일링과 부하 테스트를 통해 서버가 트래픽을 감당 못 할 시 자동으로 서버를 늘려서 무중지 서비스가 가능하도록 하는 인프라 프로젝트이다.

#git branch의 구조

main: 배포본    |   모든 기능들이 모이고 문제 없이 정상적으로 작동하면 main(배포본)에 올린다.

develop : 배포본 이전본, 총 통합 브랜치 역할    |   기능이 완성 됐으면 develop에 올린다.

feature/기능명 : 기능 | 개인이 맡은 것을 기능(feature)에서 작업.

ex) feature/login, feature/main

\!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
git checkout -b feature/철수-로그인기능
git checkout -b feature/영희-게시판기능
git checkout -b feature 이거 자체가 자기만의 feature 브랜치 만들만들면 충졸 회피 가능이래
git push origin feature/기능명
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

#브랜치 사용법

feature에 올려진 기능을 develop에 올리고 싶을 경우 github 홈페이지에 들어와서 팀의 레지스터리(여기)
들어와 노란 창의 메시지를 보면 각자가 push한 파일에 대해 campare&pull request라는 것이 떠있을 것이다.
초록 버튼을 눌러서 Comparing changes 창이 열리면 거기서 올린 브렌치(develop, main) 선택 후 제목 및 내용 작성과 
리뷰해줄 사람들을 설정하고 create pull request 초록 버튼을 누르면 된다.



#주의

✅ GitHub에 올리면 좋은 것들

IaC(Infrastructure as Code) 파일: Terraform(.tf), Ansible playbook, CloudFormation, Pulumi 코드 등 — 인프라를 "코드로" 정의한 파일들

Docker 관련: Dockerfile, docker-compose.yml

CI/CD 설정: .github/workflows/ 안의 GitHub Actions 파일, Jenkinsfile 등

Kubernetes 매니페스트: deployment.yaml, service.yaml 등

스크립트: 배포 스크립트, 서버 설정 자동화 스크립트(.sh 등)

문서: 아키텍처 다이어그램, 서버 목록, 포트 구성, 배포 절차를 정리한 README나 wiki

설정 템플릿: .env.example 처럼 어떤 변수가 필요한지 보여주는 "예시" 파일 (실제 값 말고)

🚫 절대 올리면 안 되는 것들

실제 비밀번호, API 키, DB 접속정보 (.env 파일 자체)

SSH 개인키, 인증서(.pem, .key)

클라우드 access key/secret key (AWS, GCP 등)

Terraform state 파일 (.tfstate) — 여기엔 리소스 정보가 통째로 들어있어서 민감함

작성하면서 참고한 사이트 및 AI : 클로드,
https://sanghee01.tistory.com/157
