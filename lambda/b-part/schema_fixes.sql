-- QUEUING B파트: DynamoDB -> MySQL(D-Cloud) 전환을 위한 스키마 보정
-- 실행 전 반드시 queuing_db 선택 확인: USE queuing_db;

-- 1) seat_id는 GenerateSignedLink 시점엔 알 수 없고, 사용자가 좌석을
--    직접 고르는 MarkCompleted 시점에 채워지는 값이다. 현재 NOT NULL이라
--    GenerateSignedLink의 INSERT가 그대로 실패한다. NULL 허용으로 변경.
ALTER TABLE cancellation_link MODIFY seat_id VARCHAR(50) NULL;
ALTER TABLE cancel_allocations MODIFY seat_id VARCHAR(50) NULL;

-- 2) PushToDLQ가 실패 시각을 기록할 컬럼이 없다. 추가.
ALTER TABLE cancel_allocations ADD COLUMN failed_at DATETIME NULL;

-- 3) GetNextUser의 "이번 라운드에 이미 시도한 사용자" 판별을 DB 레벨에서도
--    보장하고, Step Functions가 GenerateSignedLink를 재시도했을 때 같은
--    (event_id, user_id)로 중복 행이 쌓이지 않도록 유니크 키 추가.
--    (아래 코드는 이 키를 이용해 INSERT ... ON DUPLICATE KEY UPDATE로 처리함)
ALTER TABLE cancel_allocations ADD UNIQUE KEY uk_event_user (event_id, user_id);

-- 4) 지금 당장 쓰이진 않지만(MarkCompleted 미구현), used_by_user가 bigint인데
--    실제 user_id는 이메일 문자열이라 타입이 안 맞는다. 나중에 막히지 않도록
--    지금 같이 고쳐두는 것을 권장.
ALTER TABLE cancellation_link MODIFY used_by_user VARCHAR(100) NULL;

-- 5) token 컬럼이 UUID 길이(36자) 기준으로 만들어져 있는데, 실제로 저장하는
--    값은 UUID가 아니라 서명된 JWT 문자열 전체라 훨씬 길다. 늘려준다.
--    (PK 컬럼이라 utf8mb4 기준 인덱스 최대 길이 안에서 넉넉히 512로 설정)
ALTER TABLE cancellation_link MODIFY token VARCHAR(512) NOT NULL;

-- 6) Step Functions waitForTaskToken 패턴 도입에 따른 추가.
--    SendEmailViaSES가 이메일을 보낸 시점에 Step Functions로부터 받은
--    task_token을 저장해둬야, 나중에 /verify-link API가 이 값을 꺼내
--    SendTaskSuccess를 호출해서 대기 중인 워크플로우를 재개시킬 수 있다.
--    (이게 생기면서 기존에 구상했던 expire_checker.py 폴링 데몬은 더 이상
--    필요 없어짐 — 타임아웃을 Step Functions가 자체적으로 처리해주기 때문)
--    (AWS 문서 기준 task token은 최대 32KB까지 커질 수 있어서 VARCHAR 대신 TEXT로)
ALTER TABLE cancellation_link ADD COLUMN task_token TEXT NULL;
