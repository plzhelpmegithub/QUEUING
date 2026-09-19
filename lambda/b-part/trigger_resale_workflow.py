"""
TriggerResaleWorkflow (트리거 Lambda)

이 Lambda는 queuing-cancellation-events (A파트가 좌석 취소 확정 시 발행하는 SQS
큐)의 SQS 이벤트소스매핑으로 연결되어, 메시지가 도착하면 resale-workflow
Step Functions 상태머신 실행(StartExecution)을 시작한다.

지금까지 만든 GetNextUser~PushToDLQ 파이프라인은 "실행이 이미 시작된 이후"만
다뤄왔고, 그 실행을 언제/무엇으로 시작시키는지가 비어있었다. 이 Lambda가
그 빈 조각(트리거)을 채운다.

입력 (SQS 메시지 본문, A파트가 발행하는 스키마):
  {
    "event_id": "evt-9", "seat_id": "A-12", "status": "CANCELLED",
    "user_id": "...", "reservation_id": "...", "session_date": "...",
    "session_time": "...", "timestamp": "...", "reason": "..."
  }

동작:
  - 메시지마다 event_id를 꺼내서 StartExecution 호출
  - 실행 이름(name)을 SQS messageId 기반으로 고정해서, SQS의 "최소 1번 전달"
    특성으로 같은 메시지가 중복 전달되어도 같은 이름의 실행이 이미 있으면 AWS가
    새로 만들지 않고 기존 실행 정보를 그대로 반환함 (자연스러운 중복 방지).
    서로 다른 취소 이벤트(= 서로 다른 messageId)는 각각 별도 실행을 시작함
  - 배치 중 일부 메시지만 실패해도 성공한 건 재처리되지 않도록 batchItemFailures로
    응답 (단, 실제로 적용하려면 이벤트소스매핑에 ReportBatchItemFailures 설정이
    terraform 쪽에 켜져 있어야 하며, 안 켜져 있으면 이 필드는 무시하고
    기존처럼 배치 전체가 재시도됨. terraform 반영 여부는 담당자에게 요청 필요)

[2026-09-18 patch] 같은 event_id에 취소표가 여러 개(예: 6개) 몰리면, 그만큼
StartExecution이 여러 번 호출되어 별도 실행이 각각 시작되고, 그 실행들이 모두
같은 1번 후보를 GetNextUser로 조회해서 같은 사용자에게 링크 이메일이 여러 통
발송되는 문제가 있었다 (cancel_allocations는 (event_id, user_id) 유니크
키라 DB에는 1건만 남지만, cancellation_link/이메일은 실행 수만큼 생성됨).

이를 막기 위해 두 가지를 추가했다:
  1. 취소 좌석은 워크플로우 시작 여부와 무관하게 항상 cancel_pool_seats에
     적재한다 — 지금 당장 워크플로우를 새로 안 띄우더라도, 이 좌석은 현재
     처리 중인 사용자(또는 나중 후보)가 선택할 수 있어야 하기 때문.
  2. 해당 event_id에 이미 status='LINK_SENT'인 활성 allocation이 있으면
     (= 누군가 링크를 받고 아직 완료/만료로 끝나지 않은 상태) StartExecution을
     호출하지 않는다. 그 사람이 완료되거나 만료되면, 다음 후보를 잇는 로직은
     Step Functions ASL 쪽(MarkCompleted/MarkExpired 이후 GetNextUser로
     돌아가는 구조)이 맡는다 — 이 Lambda는 "이미 처리 중이면 새로 안 띄운다"는
     역할만 담당한다.

[유의할 점] 이전 설계는 "취소 이벤트 1건 = 실행 1개, 그 실행이 다음 순번을
계속 처리 시도"하는 구조였고, seat_id별로 정확히 몇 개의 좌석이 비었는지를
실행 개수와 1:1로 맞추지 않음(사용자가 클릭 시점에 공용 좌석 풀 중에서 직접
고르는 방식이라). 동시에 여러 취소 이벤트가 몰리면 여러 실행이 동시에 같은
후보를 보고 진행할 수 있다는 점은 각 차원에서 최종적으로 A파트 좌석 lock으로
최종 정합성은 보장하니 항상 치명적이지는 않음). 이번 patch로 실행 자체가
중복 시작되는 원인 지점은 막았지만, "완료/만료 후 자동으로 다음 후보에게
이어지는" 흐름은 ASL의 MarkCompleted를 별도로 고쳐야 완성된다 — 현재는
MarkCompleted가 End: true라 첫 사용자 처리로 워크플로우가 끝나버린다.

[2026-09-19 patch] Step Functions 실행 입력에 event_id만 넘기고 session_date/
session_time을 빠뜨려서, GetNextUser가 회차 구분 없이 후보를 찾고
GenerateSignedLink가 cancel_allocations에 빈 회차로 INSERT하는 버그가 있었다.
그 결과 A파트 상태 조회 API가 빈 회차 기준으로 본 티켓팅 대기열 참여 이력을
찾다가 못 찾아서 main_queue_required를 반환했다 (실제로는 사용자가 정상
참여했는데도 오탐). SQS 메시지에 이미 들어있는 session_date/session_time을
Step Functions 입력에 실어 보내도록 수정 — 이후 GetNextUser/GenerateSignedLink도
이 값을 받아 회차 필터링·저장을 하도록 맞춰야 완전히 해결된다.

환경변수:
  STATE_MACHINE_ARN — resale-workflow 상태머신 ARN (값이 terraform apply 시 채워줘야 함)
  MYSQL_HOST/PORT/USER/PASSWORD/DB — cancel_pool_seats 적재 및 활성 allocation 확인용

필요 권한: states:StartExecution (해당 상태머신에 대해, IAM/IRSA에 추가 필요 시 담당자 영역)
필요 패키지: pip install boto3 pymysql
"""
import json
import os

import boto3
import pymysql
import pymysql.cursors

_sfn = boto3.client("stepfunctions")
_mysql_conn = None


def _get_mysql_conn():
    global _mysql_conn
    if _mysql_conn is None or not _mysql_conn.open:
        _mysql_conn = pymysql.connect(
            host=os.environ["MYSQL_HOST"],
            port=int(os.environ.get("MYSQL_PORT", 3306)),
            user=os.environ["MYSQL_USER"],
            password=os.environ["MYSQL_PASSWORD"],
            database=os.environ.get("MYSQL_DB", "queuing_db"),
            autocommit=True,
            cursorclass=pymysql.cursors.DictCursor,
        )
    return _mysql_conn


INSERT_POOL_SEAT_SQL = """
    INSERT INTO cancel_pool_seats (event_id, session_date, session_time, seat_id, status)
    VALUES (%s, %s, %s, %s, 'AVAILABLE')
    ON DUPLICATE KEY UPDATE status = 'AVAILABLE'
"""

CHECK_ACTIVE_ALLOCATION_SQL = """
    SELECT allocation_id FROM cancel_allocations
    WHERE event_id = %s AND status = 'LINK_SENT'
    LIMIT 1
"""


def lambda_handler(event, context):
    state_machine_arn = os.environ["STATE_MACHINE_ARN"]
    batch_item_failures = []
    conn = _get_mysql_conn()

    for record in event.get("Records", []):
        message_id = record["messageId"]
        try:
            body = json.loads(record["body"])
            event_id = body["event_id"]
            status = body.get("status")
            seat_id = body.get("seat_id")
            session_date = body.get("session_date")
            session_time = body.get("session_time")

            # 취소 확정 이벤트가 아니면 무시 (스키마가 언젠가 확장되어도 안전하게)
            if status and status != "CANCELLED":
                continue

            # 취소 좌석은 워크플로우 시작 여부와 무관하게 항상 풀에 적재한다 —
            # 활성 워크플로우가 있어 이번엔 새로 시작 안 하더라도, 이 좌석은
            # 그 사용자(또는 그다음 후보)가 고를 수 있어야 하기 때문.
            with conn.cursor() as cur:
                cur.execute(
                    INSERT_POOL_SEAT_SQL,
                    (event_id, session_date, session_time, seat_id),
                )

                # 이미 이 event_id에 LINK_SENT 상태(=누군가 링크를 받고 아직
                # 응답 안 한 상태)인 allocation이 있으면, 새 워크플로우를
                # 또 시작하지 않는다 — 그게 지금 같은 사용자에게 메일이
                # 여러 통 가는 원인이었다. 이 사람이 완료/만료되면 콜백이
                # 다음 후보를 처리하게 된다 (ASL MarkCompleted가 다음
                # 후보로 이어지도록 별도 수정 필요 — 현재는 End: true).
                cur.execute(CHECK_ACTIVE_ALLOCATION_SQL, (event_id,))
                if cur.fetchone() is not None:
                    continue

            _sfn.start_execution(
                stateMachineArn=state_machine_arn,
                name=f"resale-{message_id}",
                input=json.dumps({
                    "event_id": event_id,
                    "session_date": session_date,
                    "session_time": session_time,
                }),
            )
        except _sfn.exceptions.ExecutionAlreadyExists:
            # 같은 SQS 메시지가 중복 전달된 경우 — 이미 시작된 실행이 있으므로 정상 처리로 간주
            pass
        except Exception as exc:
            print(f"[TriggerResaleWorkflow] failed for messageId={message_id}: {exc}")
            batch_item_failures.append({"itemIdentifier": message_id})

    return {"batchItemFailures": batch_item_failures}


if __name__ == "__main__":
    # 로컬 테스트: 실제 AWS 호출 없이 파싱/분기 로직만 빠르게 확인하고 싶으면
    # STATE_MACHINE_ARN에 더미 값을 넣고, boto3 자격증명이 없으면 start_execution에서
    # 에러가 나면서 batch_item_failures에 담기는 것까지 확인 가능 (실제 실행은 안 됨)
    os.environ.setdefault("STATE_MACHINE_ARN", "arn:aws:states:ap-northeast-2:230790682749:stateMachine:resale-workflow")
    sample_event = {
        "Records": [
            {
                "messageId": "test-message-id-1",
                "body": json.dumps({
                    "event_id": "evt-9",
                    "seat_id": "A-12",
                    "status": "CANCELLED",
                    "user_id": "chlwldp0224@gmail.com",
                    "session_date": "2026-11-14",
                    "session_time": "18:00",
                }),
            }
        ]
    }
    print(json.dumps(lambda_handler(sample_event, None), ensure_ascii=False))
