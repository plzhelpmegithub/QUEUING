const jwt = require('jsonwebtoken');
const token = jwt.sign({ userId: 'test-user-1' }, process.env.JWT_SECRET || 'dev-only-secret-change-me', { expiresIn: '1h' });
console.log(token);