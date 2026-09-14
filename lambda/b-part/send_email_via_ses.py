"""
SendEmailViaSES (Step Functions waitForTaskToken 버전)

GenerateSignedLink가 만든 token으로 1회용 링크 이메일을 발송한다.

재시도(backoff)는 이 Lambda 코드 안에서 하지 않고 Step Functions ASL의 Retry
필드에 맡긴다 (AWS 권장 관례). 이 함수는 한 번의 발송만 시도하고, 실패하면
예외를 그대로 던져서 Step Functions가 재시도/Catch를 판단하게 한다.

[변경] 이 Task는 ASL에서 waitForTaskToken 패턴(arn:aws:states:::lambda:invoke.waitForTaskToken)
으로 호출된다. 즉 이 Lambda가 리턴해도 Step Functions 상태는 끝나지 않고, 나중에
누군가 SendTaskSuccess/SendTaskFailure를 호출해야 다음 상태로 넘어간다:
  - 사용자가 링크를 클릭 → /verify-link API가 SendTaskSuccess 호출 (MarkCompleted로 이동)
  - 아무도 안 누르고 hold_duration_seconds(=TimeoutSecondsPath) 초과 → Step Functions가
    자동으로 States.Timeout 에러를 발생시킴 → ASL의 Catch가 MarkExpired로 이동
    (이 타임아웃은 AWS가 자동으로 처리해줘서, 예전에 만들어뒀던 expire_checker.py
     같은 별도 폴링 데몬이 더 이상 필요 없다)

그래서 /verify-link API가 나중에 "이 사용자가 맞다"고 확인했을 때 SendTaskSuccess를
호출할 수 있으려면, 이메일 발송 시점에 Step Functions가 준 task_token 값을 어딘가
저장해둬야 한다. token(JWT, cancellation_link의 PK)을 키로 삼아 같은 행에
task_token 컬럼으로 저장한다 (schema_fixes.sql에 ALTER 추가함).

입력 (GenerateSignedLink의 출력 + ASL이 주입하는 TaskToken):
  {
    "event_id": "evt-9", "user_id": "chlwldp0224@gmail.com", "queue_index": 1,
    "token": "<JWT>", "expires_at": "2026-09-10T12:18:23+00:00", "hold_duration_seconds": 600,
    "TaskToken": "<Step Functions가 주입, ASL Parameters.TaskToken.$ = $$.Task.Token>"
  }

환경변수:
  SES_SENDER_EMAIL  — 발신자 주소. SES에서 검증(verify)된 주소여야 발송 가능
  LINK_BASE_URL     — 링크 베이스 URL, 예: https://queuing.example.com/verify-link
  AWS_REGION        — 기본 ap-northeast-2
  SES_ENDPOINT      — 로컬 테스트용 엔드포인트 (실AWS면 비워둠)
  MYSQL_HOST/PORT/USER/PASSWORD/DB — task_token 저장용

필요 패키지: pip install boto3 pymysql
"""

import os
import boto3
import pymysql
import pymysql.cursors

_ses = boto3.client(
    "ses",
    region_name=os.environ.get("AWS_REGION", "ap-northeast-2"),
    endpoint_url=os.environ.get("SES_ENDPOINT") or None,
)

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


def _store_task_token(token: str, task_token: str):
    conn = _get_mysql_conn()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE cancellation_link SET task_token = %s WHERE token = %s",
            (task_token, token),
        )
        if cur.rowcount == 0:
            raise RuntimeError(
                "cancellation_link row not found for token — task_token 저장 실패"
            )


def _build_email(user_id: str, token: str, expires_at: str, hold_duration_seconds: int):
    base_url = os.environ.get("LINK_BASE_URL", "https://queuing.example.com/verify-link")
    link = f"{base_url}?token={token}"
    minutes = hold_duration_seconds // 60

    subject = "[QUEUING] 취소표 티켓팅 안내 - 지금 바로 좌석을 선택해주세요"
    body_text = (
        f"안녕하세요!\n\n"
        f"대기 중이시던 공연의 취소좌석이 발생하여 티켓팅 기회를 안내드립니다.\n"
        f"아래 링크에서 원하시는 좌석을 선택해주세요.\n\n"
        f"{link}\n\n"
        f"이 링크는 {minutes}분간만 유효하며({expires_at} 만료), 1회만 사용 가능합니다.\n"
        f"시간 안에 선택하지 않으시면 다음 대기자에게 기회가 넘어갑니다.\n"
    )
    return subject, body_text, link

def send_email_via_ses(payload: dict) -> dict:
    user_id = payload["user_id"]
    token = payload["token"]

    task_token = payload.get("TaskToken")
    if not task_token:
        # ASL Parameters에 TaskToken.$ 주입이 빠졌거나, waitForTaskToken 밖에서
        # 잘못 호출된 경우 — 조용히 넘어가면 이메일만 나가고 아무도 이후
        # SendTaskSuccess/Failure를 못 부르는 상태가 되므로 여기서 막는다.
        raise RuntimeError("TaskToken missing in input — check ASL Parameters ($$.Task.Token)")

    # 이메일 발송보다 먼저 저장한다 — 저장 실패 시 이메일을 아예 보내지 않아서
    # "이메일은 나갔는데 저장 실패로 재시도 → 중복 발송" 상황을 막는다.
    _store_task_token(token, task_token)

    subject, body_text, link = _build_email(
        user_id, token, payload["expires_at"], payload["hold_duration_seconds"]
    )

    response = _ses.send_email(
        Source=os.environ["SES_SENDER_EMAIL"],
        Destination={"ToAddresses": [user_id]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": body_text, "Charset": "UTF-8"}},
        },
    )

    return {**payload, "ses_message_id": response["MessageId"], "link": link}



def lambda_handler(event, context):
    return send_email_via_ses(event)


if __name__ == "__main__":
    # 로컬 테스트용 더미 입력 (실제 토큰 없이 발송 로직만 확인용)
    sample = {
        "event_id": "evt-9",
        "user_id": "chlwldp0224@gmail.com",
        "queue_index": 1,
        "token": "dummy-token-for-local-test",
        "expires_at": "2026-09-10T12:18:23+00:00",
        "hold_duration_seconds": 600,
        "TaskToken": "dummy-task-token-for-local-test",
    }
    print(send_email_via_ses(sample))
