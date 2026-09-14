"""
콜백 API 인증 모듈.

A파트가 이 3개 API(/verify-link, /verify-link/complete, /verify-link/expire)를
서버 대 서버로 호출할 때 X-Callback-Secret 헤더를 검증한다.
공유 시크릿은 B_CALLBACK_SECRET 환경변수(Lambda) / Kubernetes Secret(A파트) 양쪽에
동일한 값으로 설정되어 있어야 한다.

시크릿 값 자체는 절대 로그에 찍지 않는다 — 이 파일의 어떤 함수도 헤더 원문을
로깅하지 않도록 주의할 것.
"""

import hmac
import os


class UnauthorizedError(Exception):
    pass


def verify_callback_secret(headers: dict) -> None:
    """
    headers: API Gateway/Function URL 이벤트의 headers 딕셔너리.
    실패 시 UnauthorizedError를 던진다 (핸들러에서 401로 변환).
    """
    expected = os.environ.get("B_CALLBACK_SECRET", "")
    if not expected:
        # 환경변수 미설정 = 배포 설정 실수. 열어두지 말고 즉시 막는다.
        raise UnauthorizedError("B_CALLBACK_SECRET not configured")

    # API Gateway/Function URL은 헤더 키 대소문자를 보존하지 않을 수 있어
    # 소문자로 정규화해서 조회한다.
    normalized = {k.lower(): v for k, v in (headers or {}).items()}
    received = normalized.get("x-callback-secret", "")

    if not received or not hmac.compare_digest(received, expected):
        raise UnauthorizedError("invalid or missing X-Callback-Secret")
