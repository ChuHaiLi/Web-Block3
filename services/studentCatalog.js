'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Danh mục nhỏ, đọc một lần khi khởi động; không ghi/reset dữ liệu sinh viên.
function loadCatalog({
  majorsPath = path.join(__dirname, '../data/majors.json'),
  classesPath = path.join(__dirname, '../data/classes.json'),
} = {}) {
  const majors = JSON.parse(fs.readFileSync(majorsPath, 'utf8'));
  const classes = JSON.parse(fs.readFileSync(classesPath, 'utf8'));
  const majorCodes = new Set();
  const classCodes = new Set();
  const cleanString = (value, max) => typeof value === 'string' && value.length > 0 &&
    value === value.trim().normalize('NFC') && [...value].length <= max &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
  if (!Array.isArray(majors) || !majors.length || !Array.isArray(classes) || !classes.length) {
    throw new Error('Danh mục ngành/lớp phải là các mảng không rỗng.');
  }
  for (const major of majors) {
    if (!major || Object.keys(major).length !== 2 || !/^[A-Z0-9]{1,10}$/.test(major.code || '') ||
        !cleanString(major.code, 10) || !cleanString(major.name, 100) || majorCodes.has(major.code)) {
      throw new Error('Danh mục ngành có bản ghi sai định dạng hoặc trùng mã.');
    }
    majorCodes.add(major.code);
  }
  for (const item of classes) {
    if (!item || Object.keys(item).length !== 4 || !cleanString(item.code, 30) ||
        !/^[A-Za-z0-9-]+$/.test(item.code) || !cleanString(item.name, 100) ||
        !cleanString(item.majorCode, 10) || !majorCodes.has(item.majorCode) ||
        typeof item.cohort !== 'string' || !/^[0-9]{2}$/.test(item.cohort) ||
        !item.code.startsWith(item.cohort) || classCodes.has(item.code)) {
      throw new Error('Danh mục lớp sinh hoạt có mã/tên/khóa không hợp lệ, trùng mã hoặc ngành không tồn tại.');
    }
    classCodes.add(item.code);
  }
  return Object.freeze({
    majors: Object.freeze(Object.fromEntries(majors.map((item) => [item.code, item.name]))),
    classes: Object.freeze(classes.map((item) => Object.freeze({ ...item }))),
  });
}

const CATALOG = loadCatalog();
module.exports = { loadCatalog, CATALOG };
