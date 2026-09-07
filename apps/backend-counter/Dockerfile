# 1단계: 빌드 환경
FROM gradle:8-jdk17 AS build
WORKDIR /app
COPY . .
RUN gradle bootJar -x test --no-daemon
# plain.jar 말고 진짜 실행용 jar 파일만 app.jar로 복사해둠!
RUN find build/libs -name "*.jar" ! -name "*plain.jar" -exec cp {} app.jar \;

# 2단계: 실행 환경 (가벼운 JRE Alpine)
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

# 1단계에서 딱 하나 준비해둔 app.jar만 가져오기 (이제 헷갈릴 일 없음!)
COPY --from=build /app/app.jar .

ENTRYPOINT ["java", "-jar", "app.jar"]
