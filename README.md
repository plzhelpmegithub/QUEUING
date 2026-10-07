# QUEUING
CLoudDX 7기 팀 프로젝트 협업 공간. 
QUEUING이라는 사전 예약/예매 플랫폼 제작이며 대기열을 통해 순차적으로 서버에 들어가고 오토 스케일링과 부하 테스트를 통해 서버가 트래픽을 감당 못 할 시 자동으로 서버를 늘려서 무중지 서비스가 가능하도록 하는 인프라 프로젝트이다.


<본 프로젝트의 최종 토폴로지>

<img width="1467" height="869" alt="image" src="https://github.com/user-attachments/assets/7f91b9f6-84f1-4444-ba45-53c9cc21aff5" />

-----------------------------------------------------------------------------------------------------------
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
