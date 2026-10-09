'use strict';

const express = require('express');
const path = require('node:path');
const { createStudentRouter } = require('./routes/students');

function createApp({ store, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use((req, res, next) => {
    const started = performance.now();
    const pathname = req.path;
    res.set({
      'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; script-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
    res.on('finish', () => {
      // Chỉ log pathname; không log body hoặc tham số người dùng nhập.
      logger.log(`${new Date().toISOString()} ${req.method} ${pathname} ${res.statusCode} ${(performance.now() - started).toFixed(1)}ms`);
    });
    next();
  });

  app.use('/students', (req, res, next) => {
    if (req.method === 'POST' && !req.is('application/x-www-form-urlencoded')) {
      return res.status(415).render('error', {
        status: 415, message: 'Vui lòng gửi dữ liệu bằng form của ứng dụng.',
      });
    }
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 20 }));
  app.use('/css', express.static(path.join(__dirname, 'public/css')));
  app.use('/students', createStudentRouter(store));

  app.use((req, res) => {
    res.status(404).render('error', { status: 404, message: 'Trang bạn tìm không tồn tại.' });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = 500;
    let message = 'Không thể đọc hoặc lưu dữ liệu. Vui lòng thử lại hoặc kiểm tra file dữ liệu.';
    if (error.type === 'entity.too.large' || error.type === 'parameters.too.many') {
      status = 413;
      message = 'Dữ liệu gửi lên quá lớn. Vui lòng dùng form và giới hạn độ dài đã hướng dẫn.';
    } else if (error.status >= 400 && error.status < 500) {
      status = error.status;
      message = 'Yêu cầu không hợp lệ hoặc có mã hóa không được hỗ trợ.';
    }
    if (status === 500) {
      logger.error(`Lỗi hệ thống: ${error.name}; mã=${error.cause?.code || 'DATA_INVALID'}`);
    }
    res.status(status).render('error', { status, message });
  });

  return app;
}

module.exports = { createApp };
