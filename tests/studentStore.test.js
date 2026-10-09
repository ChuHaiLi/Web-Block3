'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createStudentStore, StorageError, StudentConflictError, StudentIdExhaustedError } = require('../services/studentStore');

const seedPath = path.join(__dirname, '../data/students.seed.json');
const student = { name: 'Đặng Mỹ Duyên', email: 'store-test@example.com', className: '24CNTT1' };
const record = { id: '09999901', ...student, major: 'CNTT' };

async function fixture(t, fileSystem = fs) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'student-store-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'students.json');
  const store = createStudentStore({ filePath, seedPath, fileSystem });
  return { directory, filePath, store };
}

test('Lần đầu seed đúng 40 bản ghi duy nhất, đúng năm trường, UTF-8', async (t) => {
  const { store, filePath } = await fixture(t);
  await store.initialize();
  const records = await store.getAll();
  assert.equal(records.length, 40);
  assert.equal(new Set(records.map((x) => x.id)).size, 40);
  assert.equal(new Set(records.map((x) => x.email.toLowerCase())).size, 40);
  assert.ok(records.every((x) => Object.keys(x).length === 5 && x.id.startsWith('0')));
  assert.match(await fs.readFile(filePath, 'utf8'), /Nguyễn Minh An/);
});

test('Khởi tạo lại giữ nguyên dữ liệu và không seed khi mảng rỗng', async (t) => {
  const { store, filePath } = await fixture(t);
  await store.initialize();
  await store.add(student);
  const before = await fs.readFile(filePath, 'utf8');
  const restarted = createStudentStore({ filePath, seedPath });
  await restarted.initialize();
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
  assert.equal((await restarted.getAll()).length, 41);
  await fs.writeFile(filePath, '[]\n', 'utf8');
  await restarted.initialize();
  assert.deepEqual(await restarted.getAll(), []);
});

test('JSON hỏng, sai model và bản ghi trùng không bị ghi đè', async (t) => {
  const { store, filePath } = await fixture(t);
  for (const content of ['{broken', '{}', '[{}]', JSON.stringify([record, record]),
    JSON.stringify([record, { ...record, id: '09999902', email: 'STORE-TEST@EXAMPLE.COM' }]),
    JSON.stringify([{ ...record, studentCode: 'extra' }])]) {
    await fs.writeFile(filePath, content, 'utf8');
    await assert.rejects(store.initialize(), StorageError);
    assert.equal(await fs.readFile(filePath, 'utf8'), content);
  }
});

test('Validation thất bại, client gửi ID và email trùng không thay đổi file', async (t) => {
  const { store, filePath } = await fixture(t);
  await store.initialize();
  const before = await fs.readFile(filePath, 'utf8');
  for (const record of [{ ...student, name: '' }, { ...student, id: '02400001' },
    { ...student, email: 'MINH.AN01@EXAMPLE.COM' }]) {
    await assert.rejects(store.add(record), StudentConflictError);
    assert.equal(await fs.readFile(filePath, 'utf8'), before);
  }
});

test('Hai thao tác gần nhau cấp ID khác nhau; email trùng chỉ lưu một', async (t) => {
  const { store } = await fixture(t);
  await store.initialize();
  const added = await Promise.all([store.add(student), store.add({ ...student, email: 'second@example.com' })]);
  assert.deepEqual(added.map((x) => x.id), ['02410011', '02410012']);
  assert.equal((await store.getAll()).length, 42);
  const results = await Promise.allSettled([
    store.add({ ...student, email: 'third@example.com' }),
    store.add({ ...student, email: 'THIRD@EXAMPLE.COM' }),
  ]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(results.filter((x) => x.status === 'rejected').length, 1);
  assert.equal((await store.getAll()).length, 43);
});

test('Lỗi rename giữ file chính; dọn file tạm và hàng đợi tiếp tục', async (t) => {
  let failRename = false;
  const fileSystem = { ...fs, rename: async (...args) => {
    if (failRename) throw Object.assign(new Error('Lỗi rename được mô phỏng trong test'), { code: 'EACCES' });
    return fs.rename(...args);
  } };
  const { store, filePath, directory } = await fixture(t, fileSystem);
  await store.initialize();
  const before = await fs.readFile(filePath, 'utf8');
  const beforeFiles = await fs.readdir(directory);
  failRename = true;
  await assert.rejects(store.add(student), StorageError);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
  assert.deepEqual(await fs.readdir(directory), beforeFiles);
  failRename = false;
  await store.add(student);
  assert.equal((await store.getAll()).length, 41);
});

test('Lỗi ghi file tạm giữ dữ liệu; seed sai số lượng bị từ chối', async (t) => {
  let failWrite = false;
  const fileSystem = { ...fs, writeFile: async (...args) => {
    if (failWrite) throw Object.assign(new Error('Lỗi ghi được mô phỏng trong test'), { code: 'ENOSPC' });
    return fs.writeFile(...args);
  } };
  const { store, filePath, directory } = await fixture(t, fileSystem);
  await store.initialize();
  const before = await fs.readFile(filePath, 'utf8');
  const beforeFiles = await fs.readdir(directory);
  failWrite = true;
  await assert.rejects(store.add(student), StorageError);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
  assert.deepEqual(await fs.readdir(directory), beforeFiles);
  const wrongSeed = path.join(directory, 'wrong-seed.json');
  await fs.writeFile(wrongSeed, JSON.stringify([record]), 'utf8');
  const otherPath = path.join(directory, 'other.json');
  const other = createStudentStore({ filePath: otherPath, seedPath: wrongSeed });
  await assert.rejects(other.initialize(), StorageError);
  await assert.rejects(fs.readFile(otherPath), { code: 'ENOENT' });
});

test('File bị mất lúc chạy phải báo lỗi, không tự seed lại', async (t) => {
  const { store, filePath } = await fixture(t);
  await store.initialize();
  await fs.unlink(filePath);
  await assert.rejects(store.getAll(), StorageError);
  await assert.rejects(store.add(student), StorageError);
  await assert.rejects(fs.readFile(filePath), { code: 'ENOENT' });
});

test('Hai lần thêm liên tiếp lấy max theo khóa+1, giữ tám chữ số và bản ghi cũ', async (t) => {
  const { store } = await fixture(t);
  await store.initialize();
  const before = await store.getAll();
  const first = await store.add(student);
  const second = await store.add({ ...student, email: 'next@example.com' });
  assert.equal(first.id, '02410011');
  assert.equal(second.id, '02410012');
  assert.match(first.id, /^[0-9]{8}$/);
  assert.match(second.id, /^[0-9]{8}$/);
  assert.deepEqual((await store.getAll()).slice(0, 40), before);
});

test('MSSV cũ không đồng nhất được giữ nguyên; không dùng lại lỗ trống dưới max', async (t) => {
  const { store, filePath } = await fixture(t);
  await store.initialize();
  const legacy = [
    { ...record, id: '2222' },
    { ...record, id: 'sv-0001', email: 'legacy-letter@example.com', name: '  Nguyễn   An  ' },
    { ...record, id: '00000009', email: 'nine@example.com' },
  ];
  await fs.writeFile(filePath, JSON.stringify(legacy), 'utf8');
  await store.initialize();
  const added = await store.add({ ...student, email: 'fresh@example.com' });
  assert.equal(added.id, '02410011');
  assert.deepEqual((await store.getAll()).slice(0, 3), legacy);
});

test('Mảng rỗng cấp02400001; hết phạm vi khóa24 trả lỗi và giữ file', async (t) => {
  const { store, filePath } = await fixture(t);
  await store.initialize();
  // Kho rỗng mới tạo có metadata hợp lệ, không phải kho mất lịch sử.
  const statePath = path.join(path.dirname(filePath), 'students.id-state.json');
  await fs.writeFile(statePath, JSON.stringify({ version: 2, legacyHighWaterMark: '00000000', counters: { '024': '00000', '025': '00000', '026': '00011' } }));
  await fs.writeFile(filePath, '[]', 'utf8');
  await store.initialize();
  assert.equal((await store.add(student)).id, '02400001');
  await fs.writeFile(filePath, JSON.stringify([{ ...record, id: '02499998' }]), 'utf8');
  assert.equal((await store.add({ ...student, email: 'last@example.com' })).id, '02499999');
  const before = await fs.readFile(filePath, 'utf8');
  await assert.rejects(store.add({ ...student, email: 'overflow@example.com' }), StudentIdExhaustedError);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
});

test('MSSV số cũ ngoài định dạng được giữ nguyên, không tham gia bộ đếm khóa', async (t) => {
  const { store, filePath } = await fixture(t);
  await store.initialize();
  const before = JSON.stringify([{ ...record, id: '100000000' }]);
  await fs.writeFile(filePath, before, 'utf8');
  await store.initialize();
  assert.equal((await store.add({ ...student, email: 'fresh@example.com' })).id, '02410011');
  assert.deepEqual((await store.getAll()).slice(0, 1), JSON.parse(before));
});

test('Gọi store trực tiếp vẫn kiểm tra danh mục và quan hệ lớp/ngành trong hàng đợi', async (t) => {
  const { store, filePath } = await fixture(t);
  await store.initialize();
  const before = await fs.readFile(filePath, 'utf8');
  for (const input of [{ ...student, className: 'UNKNOWN' }, { ...student, className: '24C11', major: 'VL' }]) {
    await assert.rejects(store.add(input), StudentConflictError);
    assert.equal(await fs.readFile(filePath, 'utf8'), before);
  }
  assert.equal((await store.add({ ...student, className: '24C11' })).id, '02410011');
});
