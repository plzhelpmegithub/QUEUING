"""
TriggerResaleWorkflow (신규 Lambda)

큐: queuing-cancellation-events (A파트가 좌석 취소 확정 시 발행하는 SQS 큐)
이 Lambda는 SQS 이벤트소스매핑으로 이 큐에 연결되어, 메시지가 도착하면
resale-workflow Step Functions 상태머신 실행(StartExecution)을 시작시킨다.

지금까지 만든 GetNextUser~PushToDLQ 파이프라인은 "실행이 이미 시작된 이후"만
다루고 있었고, 그 실행을 누가/무엇이 시작시키는지가 빠져있었음 — 이 Lambda가
그 빠진 조각(트리거)을 채운다.

입력 (SQS 메시지 본문, A파트가 발행하는 스키마):
  {
    "event_id": "evt-9", "seat_id": "A-12", "status": "CANCELLED",
    "user_id": "...", "reservation_id": "...", "session_date": "...",
    "session_time": "...", "timestamp": "...", "reason": "..."
  }

동작:
  - 메시지마다 event_id를 꺼내서 StartExecution 호출
  - 실행 이름(name)을 SQS messageId 기반으로 고정해서, SQS의 "최소 1번 전달"
    특성으로 같은 메시지가 중복 전달돼도 같은 이름의 실행이 이미 있으면 AWS가
    새로 만들지 않고 기존 실행 정보를 그대로 반환함 (자연스러운 중복 방지).
    서로 다른 취소 이벤트(= 서로 다른 messageId)는 각각 별도 실행을 시작함.
  - 배치 중 일부 메시지만 실패해도 성공한 건 재처리되지 않도록 batchItemFailures로
    응답 (단, 이걸 실제로 쓰려면 이벤트소스매핑에 ReportBatchItemFailures 설정이
    팀장 terraform 쪽에서 켜져 있어야 함 — 안 켜져 있으면 이 필드는 무시되고
    기존처럼 배치 전체가 재시도됨. terraform 반영 시 팀장에게 요청 필요)

[알아둘 것] 지금 설계는 "취소 이벤트 1건 = 실행 1개, 그 실행이 다음 순번을
계속 시도"하는 구조라, seat_id별로 정확히 몇 개의 좌석이 비었는지를 실행 개수와
1:1로 맞추진 않음(사용자가 클릭 시점에 남은 좌석 중에서 직접 고르는 풀 방식이라).
동시에 여러 취소 이벤트가 몰리면 여러 실행이 동시에 같은 후보 풀을 놓고 진행될
수 있다는 점은 팀 차원에서 한 번은 논의해볼 만함(A파트 좌석 lock으로 최종
정합성은 보장되니 당장 치명적이진 않음).

환경변수:
  STATE_MACHINE_ARN — resale-workflow 상태머신 ARN (팀장이 terraform apply 후 채워줘야 함)

필요 권한: states:StartExecution (대상 상태머신에 대해), IAM/IRSA에 추가 필요 — 팀장 영역
필요 패키지: pip install boto3
"""
import json
import os

import boto3

_sfn = boto3.client("stepfunctions")


def lambda_handler(event, context):
    state_machine_arn = os.environ["STATE_MACHINE_ARN"]
    batch_item_failures = []

    for record in event.get("Records", []):
        message_id = record["messageId"]
        try:
            body = json.loads(record["body"])
            event_id = body["event_id"]
            status = body.get("status")

            # 취소 확정 이벤트가 아니면 무시 (스키마가 나중에 늘어나도 안전하게)
            if status and status != "CANCELLED":
                continue

            _sfn.start_execution(
                stateMachineArn=state_machine_arn,
                name=f"resale-{message_id}",
                input=json.dumps({"event_id": event_id}),
            )
        except _sfn.exceptions.ExecutionAlreadyExists:
            # 같은 SQS 메시지가 중복 전달된 경우 — 이미 시작된 실행이 있으니 정상 처리로 간주
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
                }),
            }
        ]
    }
    print(json.dumps(lambda_handler(sample_event, None), ensure_ascii=False))
