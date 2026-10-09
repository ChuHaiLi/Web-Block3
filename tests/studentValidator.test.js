'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateStudent, validateNewStudent, isValidEmail } = require('../validators/studentValidator');

const valid = { id: '02499901', name: 'Nguyễn Minh Anh', email: 'anh@example.com', className: '24CNTT1', major: 'CNTT' };

test('Chuẩn hóa MSSV, Unicode, khoảng trắng và tên miền; model đúng năm trường', () => {
  const result = validateStudent({
    ...valid, id: '  sv-0001  ', name: '  Đặng   Mỹ Duyên  '.normalize('NFD'),
    email: ' Anh+Lop@EXAMPLE.COM ', className: ' 24  CNTT1 ', studentCode: 'ignored',
  });
  assert.equal(result.isValid, true);
  assert.deepEqual(result.values, {
    id: 'SV-0001', name: 'Đặng Mỹ Duyên', email: 'Anh+Lop@example.com', className: '24 CNTT1', major: 'CNTT',
  });
  assert.equal(validateStudent(valid).values.id, '02499901');
});

test('Mọi trường đều bắt buộc; xử lý thiếu, rỗng và sai kiểu', () => {
  for (const field of Object.keys(valid)) {
    for (const value of [undefined, null, '', '   ', ['x'], {}, 123, true]) {
      const result = validateStudent({ ...valid, [field]: value });
      assert.equal(result.isValid, false, `${field}: ${String(value)}`);
      assert.ok(result.errors[field]);
      assert.equal(result.values.email, field === 'email' ? '' : valid.email);
    }
  }
  for (const input of [undefined, null, [], 'abc']) {
    assert.equal(Object.keys(validateStudent(input).errors).length, 5);
  }
});

test('MSSV có độ dài 4–20 và chỉ chữ Latin, chữ số, dấu -', () => {
  for (const id of ['0012', 'SV-01', 'A'.repeat(20)]) assert.equal(validateStudent({ ...valid, id }).isValid, true);
  for (const id of ['123', 'A'.repeat(21), 'SV_001', 'SV 001', 'Đ123', '<123>', 'ß1234', 'ſ1234', 'ﬃ123']) {
    assert.ok(validateStudent({ ...valid, id }).errors.id);
  }
});

test('Tên Việt, dấu nháy và gạch nối hợp lệ; giới hạn tên/lớp và ký tự điều khiển', () => {
  for (const name of ['Đỗ Hải Yến', 'O’Connor', 'Anne-Marie', 'A', 'Á'.repeat(100)]) {
    assert.equal(validateStudent({ ...valid, name }).isValid, true);
  }
  assert.ok(validateStudent({ ...valid, name: 'Á'.repeat(101) }).errors.name);
  assert.ok(validateStudent({ ...valid, className: 'A'.repeat(31) }).errors.className);
  for (const field of Object.keys(valid)) {
    assert.ok(validateStudent({ ...valid, [field]: 'a\u0000b' }).errors[field]);
  }
});

test('Email thông dụng: dấu +, dấu nháy, tên miền con; từ chối cú pháp sai', () => {
  for (const email of ['an+lop@example.com', 'a.b@sv.example.edu.vn', "o'connor@example.com", 'a@EXAMPLE.COM']) {
    assert.equal(isValidEmail(email), true, email);
  }
  for (const email of ['a', 'a@', '@example.com', 'a@@example.com', 'a b@example.com', 'a..b@example.com',
    '.a@example.com', 'a.@example.com', 'a@-example.com', 'a@example-.com', 'a@example..com',
    'a@localhost', 'a@exam_ple.com', 'á@example.com', 'a'.repeat(65) + '@example.com']) {
    assert.equal(isValidEmail(email), false, email);
    assert.ok(validateStudent({ ...valid, email }).errors.email);
  }
  const boundary = 'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(61);
  assert.equal(boundary.length, 254);
  assert.equal(isValidEmail(boundary), true);
  assert.equal(isValidEmail(boundary + 'd'), false);
});

test('Ngành phải thuộc danh sách; không tin giá trị từ prototype', () => {
  for (const major of ['CNTT', 'KHDL', 'TOAN', 'VL']) {
    assert.equal(validateStudent({ ...valid, major }).isValid, true);
  }
  for (const major of ['other', 'toString', '__proto__', 'cntt']) {
    assert.ok(validateStudent({ ...valid, major }).errors.major);
  }
  assert.ok(validateStudent(Object.create(valid)).errors.id);
});

test('Form mới chỉ nhận ba trường, suy ngành và giữ dữ liệu hợp lệ', () => {
  const { id, major, ...input } = valid;
  const result = validateNewStudent({ ...input, extra: 'ignored' });
  assert.equal(result.isValid, true);
  assert.deepEqual(result.values, { ...input, major });
  assert.equal(Object.hasOwn(result.values, 'id'), false);
  const invalid = validateNewStudent({ ...input, email: 'bad' });
  assert.ok(invalid.errors.email);
  assert.equal(invalid.values.name, input.name);
});

test('Không chấp nhận id do client gửi, kể cả rỗng, mảng và số', () => {
  const { id, major, ...input } = valid;
  for (const supplied of ['02400001', '', [], {}, 123, undefined]) {
    const result = validateNewStudent({ ...input, id: supplied });
    assert.equal(result.isValid, false);
    assert.ok(result.errors.form);
    assert.equal(Object.hasOwn(result.values, 'id'), false);
  }
});
