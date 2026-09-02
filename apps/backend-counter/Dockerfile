FROM gradle:8-jdk17 AS build
WORKDIR /app
COPY . .
RUN gradle bootJar --no-daemon
# 파일 이름 안 따짐! 용량이 가장 큰 파일(실행용 Fat Jar) 딱 1개만 찾아서 app.jar로 빼둠
RUN cp $(ls -S1 build/libs/*.jar | head -n 1) app.jar

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
# 위에서 예쁘게 빼둔 app.jar 하나만 쏙 가져옴
COPY --from=build /app/app.jar .
ENTRYPOINT ["java", "-jar", "app.jar"]
