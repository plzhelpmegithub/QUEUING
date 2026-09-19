-- QUEUING B파트: DynamoDB -> MySQL(D-Cloud) 전환을 위한 스키마 보정
-- 실행 전 반드시 queuing_db 선택 확인: USE queuing_db;

-- 1) seat_id는 GenerateSignedLink 시점에는 아직 없고, 사용자가 좌석을
--    직접 고르는 MarkCompleted 시점에 채워지는 값이다. 현재 NOT NULL이라
--    GenerateSignedLink의 INSERT가 그대로 실패했다. NULL 허용으로 변경.
ALTER TABLE cancellation_link MODIFY seat_id VARCHAR(50) NULL;
ALTER TABLE cancel_allocations MODIFY seat_id VARCHAR(50) NULL;

-- 2) PushToDLQ가 실패 시각을 기록할 컬럼이 없다. 추가.
ALTER TABLE cancel_allocations ADD COLUMN failed_at DATETIME NULL;

-- 3) GetNextUser의 "이번 라운드에 이미 시도된 사용자" 판단이 DB 레벨에서도
--    보장되고, Step Functions가 GenerateSignedLink를 재시도했을 때 같은
--    (event_id, user_id)로 중복 행이 쌓이지 않도록 유니크 인덱스 추가.
--    (아래 코드 쪽에서는 이걸 INSERT ... ON DUPLICATE KEY UPDATE로 처리함)
ALTER TABLE cancel_allocations ADD UNIQUE KEY uk_event_user (event_id, user_id);

-- 4) used_by_user가 bigint로 되어 있는데 실제 user_id는 이메일 문자열이라
--    타입이 안 맞는다. 나중에 이 컬럼을 쓰게 될 때 막히지 않도록 미리 고쳐둠.
ALTER TABLE cancellation_link MODIFY used_by_user VARCHAR(100) NULL;

-- 5) token 컬럼이 UUID 길이(36자) 기준으로 만들어져 있는데, 실제로 저장하는
--    값은 UUID가 아니라 서명된 JWT 문자열이라 전체가 훨씬 길다. 넓혀줌.
--    (PK 컬럼이라 utf8mb4 기준 인덱스 최대 길이 안에서 넉넉히 512로 설정)
ALTER TABLE cancellation_link MODIFY token VARCHAR(512) NOT NULL;

-- 6) Step Functions waitForTaskToken 패턴 도입에 따른 추가.
--    SendEmailViaSES가 이메일을 보낸 시점에 Step Functions로부터 받은
--    task_token을 저장해야, 나중에 /verify-link API가 그 값을 꺼내
--    SendTaskSuccess를 호출해서 대기 중인 워크플로우를 재개시킬 수 있다.
--    (이렇게 옮기면서 기존에 구상했던 expire_checker.py 같은 폴링 스케줄러는 더 이상
--    필요 없어져 이 부분을 Step Functions가 자체적으로 처리해주기 때문)
--    (AWS 문서 기준 task token은 최대 32KB까지 커질 수 있어서 VARCHAR 대신 TEXT로)
ALTER TABLE cancellation_link ADD COLUMN task_token TEXT NULL;

-- 7) 취소표 재판매 워크플로우가 같은 회차에 동시에 여러 개 도는 걸 막는 락
--    테이블. 좌석 여러 개가 거의 동시에 취소되면 SQS 메시지도 거의 동시에
--    여러 개 도착하는데, "SELECT로 활성 allocation 확인 후 실행 시작" 방식은
--    체크-후-실행 사이 시간차 때문에 여러 메시지가 전부 통과해버리는
--    레이스 컨디션이 있었다 (실제로 좌석 5개 동시 취소 시 같은 사용자에게
--    메일 5통이 간 사고 발생). INSERT 자체의 PRIMARY KEY 원자성으로 막는다.
--
--    updated_at은 워크플로우가 살아있는 동안(GenerateSignedLink가 매 후보
--    처리 사이클마다) 계속 갱신된다. 정상 종료 경로(후보 소진, 좌석 소진)는
--    명시적으로 이 행을 DELETE하지만, 워크플로우가 처리되지 않은 에러로
--    FAILED되거나 콘솔에서 수동 중지되면 그 경로를 못 타므로 락이 영원히
--    안 풀릴 수 있다 — trigger_resale_workflow.py의 락 획득 로직이
--    updated_at을 보고, LOCK_STALE_SECONDS(기본 1800초) 이상 갱신이 없으면
--    죽은 락으로 보고 다음 취소 이벤트가 가져간다 (TTL 기반 안전장치).
CREATE TABLE cancel_active_lock (
  lock_key VARCHAR(180) NOT NULL PRIMARY KEY,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
