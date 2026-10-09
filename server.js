'use strict';

const { createApp } = require('./app');
const { createStudentStore } = require('./services/studentStore');

async function start() {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT phải là số nguyên từ 1 đến 65535.');
  }
  const store = createStudentStore();
  await store.initialize();
  const app = createApp({ store });
  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Ứng dụng sẵn sàng: http://127.0.0.1:${port}/students`);
  });
  server.on('error', (error) => {
    console.error(`Không thể mở cổng ${port}: ${error.code || error.message}`);
    process.exitCode = 1;
  });
}

start().catch((error) => {
  console.error(`Khởi động thất bại: ${error.message}`);
  if (error.cause) console.error(`Chi tiết: ${error.cause.message}`);
  process.exitCode = 1;
});
