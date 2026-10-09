'use strict';

const FIELDS = ['id', 'name', 'email', 'className', 'major'];
const INPUT_FIELDS = ['name', 'email', 'className'];
const { CATALOG } = require('../services/studentCatalog');
const MAJORS = CATALOG.majors;

const LABELS = {
  id: 'MSSV', name: 'Họ và tên', email: 'Email', className: 'Lớp sinh hoạt', major: 'Ngành học',
};
const LIMITS = { id: 20, name: 100, email: 254, className: 30, major: 10 };
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

function normalizeText(value) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

// Chính sách email thông dụng, không cố triển khai toàn bộ chuẩn RFC.
function isValidEmail(email) {
  if (email.length > 254 || !/^[\x21-\x7e]+$/.test(email)) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || !domain || domain.length > 253) return false;
  if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  const labels = domain.split('.');
  return labels.length >= 2 && labels.every((label) =>
    label.length >= 1 && label.length <= 63 &&
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label));
}

function validateFields(input, fields) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const values = Object.fromEntries(fields.map((field) => [field, '']));
  const errors = {};

  for (const field of fields) {
    const raw = Object.hasOwn(source, field) ? source[field] : undefined;
    if (raw === undefined || raw === null) {
      errors[field] = `${LABELS[field]} không được để trống.`;
      continue;
    }
    if (typeof raw !== 'string') {
      errors[field] = `${LABELS[field]} phải là một giá trị văn bản duy nhất.`;
      continue;
    }
    if (CONTROL_CHARACTERS.test(raw)) {
      errors[field] = `${LABELS[field]} chứa ký tự điều khiển không hợp lệ.`;
      continue;
    }

    let value = field === 'name' || field === 'className' ? normalizeText(raw) : raw.trim();
    if (field === 'id') {
      // Kiểm tra ASCII trước viết hoa: ký tự như ß có thể biến thành SS.
      if (/[^\x00-\x7f]/.test(value)) {
        errors.id = 'MSSV gồm 4–20 ký tự: chữ Latin, chữ số hoặc dấu gạch nối (-).';
      }
      value = value.toUpperCase();
    }
    if (field === 'email') {
      const at = value.lastIndexOf('@');
      if (at >= 0) value = value.slice(0, at + 1) + value.slice(at + 1).toLowerCase();
    }

    // Đếm Unicode code points sau NFC, không đếm riêng từng byte UTF-8.
    if ([...value].length > LIMITS[field]) {
      errors[field] = `${LABELS[field]} không được dài quá ${LIMITS[field]} ký tự.`;
      continue;
    }
    values[field] = value;
    if (!value) errors[field] = `${LABELS[field]} không được để trống.`;
  }

  if (fields.includes('id') && !errors.id && !/^[A-Z0-9-]{4,20}$/.test(values.id)) {
    errors.id = 'MSSV gồm 4–20 ký tự: chữ Latin, chữ số hoặc dấu gạch nối (-).';
  }
  if (!errors.email && !isValidEmail(values.email)) {
    errors.email = 'Email không hợp lệ. Ví dụ: sinhvien@example.com.';
  }
  if (fields.includes('major') && !errors.major && !Object.hasOwn(MAJORS, values.major)) {
    errors.major = 'Vui lòng chọn ngành học hợp lệ.';
  }
  return { values, errors, isValid: Object.keys(errors).length === 0 };
}

// Đọc dữ liệu cũ vẫn chấp nhận định dạng MSSV linh hoạt của phiên bản trước.
function validateStudent(input) {
  return validateFields(input, FIELDS);
}

// POST nhận ba trường; ngành lấy từ danh mục, không nhận id/major của client.
function validateNewStudent(input) {
  const result = validateFields(input, INPUT_FIELDS);
  if (!result.errors.className) {
    const selectedClass = CATALOG.classes.find((item) => item.code === result.values.className);
    if (!selectedClass) {
      result.errors.className = 'Vui lòng chọn lớp sinh hoạt có sẵn trong danh mục.';
    } else if (!Object.hasOwn(MAJORS, selectedClass.majorCode) || !/^[0-9]{2}$/.test(selectedClass.cohort)) {
      result.errors.className = 'Lớp sinh hoạt chưa có ngành hoặc khóa tuyển sinh hợp lệ.';
    } else {
      result.values.major = selectedClass.majorCode;
    }
  }
  if (input && typeof input === 'object' && Object.hasOwn(input, 'id')) {
    result.errors.form = 'MSSV được hệ thống tự động cấp. Không được gửi trường id trong form.';
  }
  if (input && typeof input === 'object' && Object.hasOwn(input, 'major')) {
    result.errors.form = (result.errors.form ? result.errors.form + ' ' : '') +
      'Ngành học được xác định từ lớp sinh hoạt. Không được gửi trường major trong form.';
  }
  result.isValid = Object.keys(result.errors).length === 0;
  return result;
}

function isValidStudentId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9-]{4,20}$/.test(id);
}

module.exports = { FIELDS, INPUT_FIELDS, MAJORS, validateStudent, validateNewStudent, isValidEmail, isValidStudentId };
