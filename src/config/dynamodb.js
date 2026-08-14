const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');       // DynamoDB 기본 클라이언트
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');   // JSON 편의 래퍼

// DynamoDB 연결 설정 — 팀원 온프레미스 LocalStack에 연결
const client = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://192.168.0.191:4566', // 팀원 DB 주소
  region: process.env.AWS_REGION || 'ap-northeast-2',                      // AWS 리전 (로컬이라 아무 값이나 가능)
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'fakekey',               // 로컬이라 가짜 키 사용
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'fakesecret',
  },
});

// DocumentClient — JSON 객체로 편하게 읽기/쓰기 가능하게 래핑
const docClient = DynamoDBDocumentClient.from(client);

console.log(`[DynamoDB] Endpoint: ${process.env.DYNAMODB_ENDPOINT || 'http://192.168.0.191:4566'}`);

module.exports = { client, docClient };
