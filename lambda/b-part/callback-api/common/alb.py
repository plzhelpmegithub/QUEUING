"""
ALB(Application Load Balancer) 타겟그룹 Lambda 연동 공통 헬퍼.

API Gateway와 이벤트/응답 형식이 다르다:
- 요청 body는 문자열이고, isBase64Encoded가 true면 base64 디코딩 필요
- 헤더는 소문자로 옴 (multiValueHeaders 미사용 시 단일 값 dict)
- 응답은 statusCode/headers/body/isBase64Encoded 형태를 정확히 지켜야 함
  (statusDescription은 선택 필드라 생략 — ALB가 기본값을 채움)
"""

import base64
import json


def parse_json_body(event: dict) -> dict:
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    if not raw:
        return {}
    return json.loads(raw)


def alb_response(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=str, ensure_ascii=False),
        "isBase64Encoded": False,
    }
