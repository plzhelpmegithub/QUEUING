const { CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { PutCommand, GetCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { client, docClient } = require('../config/dynamodb');

const TABLE_NAME = 'Reservations'; // 예약 기록 테이블

/**
 * 테이블 생성 (서버 시작 시 1회 호출)
 * - 이미 존재하면 스킵
 * - 파티션 키: seatId (어떤 좌석인지)
 * - 정렬 키: reservedAt (언제 예약했는지 — 취소 후 재예약 이력 추적 가능)
 */
async function initTable() {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`[DynamoDB] ${TABLE_NAME} 테이블 이미 존재`);
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      // 테이블이 없으면 새로 생성
      await client.send(new CreateTableCommand({
        TableName: TABLE_NAME,
        KeySchema: [
          { AttributeName: 'seatId', KeyType: 'HASH' },       // 파티션 키 — 좌석별 분류
          { AttributeName: 'reservedAt', KeyType: 'RANGE' },   // 정렬 키 — 시간순 정렬
        ],
        AttributeDefinitions: [
          { AttributeName: 'seatId', AttributeType: 'S' },    // S = String
          { AttributeName: 'reservedAt', AttributeType: 'S' },
        ],
        BillingMode: 'PAY_PER_REQUEST', // 온디맨드 — 요청량에 따라 자동 과금
      }));
      console.log(`[DynamoDB] ${TABLE_NAME} 테이블 생성 완료`);
    } else {
      throw err;
    }
  }
}

/**
 * 예약 기록 저장
 * - 결제 완료(sold) 시 호출
 * - Redis는 휘발성이라 서버 재시작 시 날아감 → DynamoDB에 영구 저장
 */
async function saveReservation(data) {
  const item = {
    seatId: data.seatId,                      // 어떤 좌석
    userId: data.userId,                      // 누가 예약
    status: 'confirmed',                      // 예약 확정 상태
    reservedAt: new Date().toISOString(),     // 예약 시간
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item,
  }));

  console.log(`[DynamoDB] 예약 저장: ${data.seatId} → ${data.userId}`);
  return item;
}

/**
 * 특정 좌석 예약 이력 조회
 * - 좌석별 예약/취소/재예약 히스토리 확인
 * - Query — 파티션 키(seatId) 기준 조회 (Scan보다 빠름)
 */
async function getReservationsBySeat(seatId) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'seatId = :sid',    // 파티션 키로 필터링
    ExpressionAttributeValues: {
      ':sid': seatId,
    },
  }));

  return result.Items || [];
}

/**
 * 전체 예약 목록 조회
 * - Scan — 테이블 전체 순회 (데이터 많으면 느림, 모니터링/관리용)
 */
async function getAllReservations() {
  const result = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
  }));

  return result.Items || [];
}

module.exports = { initTable, saveReservation, getReservationsBySeat, getAllReservations };
