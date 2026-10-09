'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { selectStudents, StudentQueryError } = require('../services/studentSearch');

const records = Array.from({ length: 42 }, (_, index) => ({
  id: String(index + 1).padStart(8, '0'), name: 'Nguyễn Minh An',
  email: `page${index}@example.com`, className: '24CNTT1', major: 'CNTT',
}));

test('Phân trang 42 bản ghi thành 20/20/2, không lặp hoặc bỏ sót, không sửa dữ liệu', () => {
  const before = JSON.stringify(records);
  const pages = [1, 2, 3].map((page) => selectStudents(records, { page: String(page) }));
  assert.deepEqual(pages.map((entry) => entry.students.length), [20, 20, 2]);
  assert.deepEqual(pages.map((entry) => [entry.pagination.start, entry.pagination.end]), [[1, 20], [21, 40], [41, 42]]);
  assert.deepEqual(pages.flatMap((entry) => entry.students), records);
  assert.equal(new Set(pages.flatMap((entry) => entry.students.map((item) => item.id))).size, 42);
  assert.ok(pages.every((entry) => entry.resultCount === 42 && entry.pagination.totalPages === 3));
  assert.equal(JSON.stringify(records), before);
  assert.equal(selectStudents(records).pagination.page, 1);
});

test('Lọc trước phân trang; giữ q, lớp và ngành trong mọi liên kết', () => {
  const selected = selectStudents([...records, { ...records[0], id: '09999999', name: 'Không khớp', major: 'VL', className: '24VL1' }], {
    q: '  NGUYEN  ', className: '24CNTT1', major: 'CNTT', page: '2',
  });
  assert.equal(selected.totalCount, 43);
  assert.equal(selected.resultCount, 42);
  assert.equal(selected.students.length, 20);
  assert.equal(selected.pagination.page, 2);
  assert.equal(selected.pagination.totalPages, 3);
  for (const link of selected.pagination.pageLinks) {
    const url = new URL(link.url, 'http://localhost');
    assert.equal(url.searchParams.get('q'), 'NGUYEN');
    assert.equal(url.searchParams.get('className'), '24CNTT1');
    assert.equal(url.searchParams.get('major'), 'CNTT');
    assert.equal(url.searchParams.get('page'), String(link.number));
  }
  assert.match(selected.pagination.previousUrl, /page=1$/);
  assert.match(selected.pagination.nextUrl, /page=3$/);
  assert.equal(selected.clearSearchUrl, '/students?className=24CNTT1&major=CNTT');
  assert.equal(selectStudents(records, { q: 'nguyen' }).pagination.page, 1);
});

test('Trang vượt giới hạn về trang cuối; rỗng/không kết quả vẫn có trang 1 an toàn', () => {
  assert.equal(selectStudents(records, { page: '9999' }).pagination.page, 3);
  for (const selected of [selectStudents([], { page: '99' }), selectStudents(records, { q: 'zzz', page: '99' })]) {
    assert.equal(selected.resultCount, 0);
    assert.equal(selected.pagination.page, 1);
    assert.equal(selected.pagination.totalPages, 1);
    assert.equal(selected.pagination.start, 0);
    assert.equal(selected.pagination.end, 0);
    assert.equal(selected.pagination.previousUrl, '');
    assert.equal(selected.pagination.nextUrl, '');
  }
  const small = selectStudents(records.slice(0, 7), { page: '2' });
  assert.equal(small.students.length, 7);
  assert.equal(small.pagination.page, 1);
});

test('Page sai kiểu/âm/0/thập phân/quá lớn/mảng bị từ chối, không gây lỗi template', () => {
  for (const page of ['', '0', '-1', '1.5', 'abc', '01', ' 1 ', '1e2', 'Infinity', '9007199254740992', [], {}, 2]) {
    assert.throws(() => selectStudents(records, { page }), StudentQueryError, String(page));
  }
  assert.throws(() => selectStudents(records, { 'page[x]': '1' }), StudentQueryError);
});

test('Liên kết phân trang encode query nguy hiểm và giới hạn số nút với tập lớn', () => {
  const large = Array.from({ length: 10000 }, (_, index) => ({ ...records[0], id: String(index), name: '<a & b>' }));
  const selected = selectStudents(large, { q: '<a & b>', page: '250' });
  assert.ok(selected.pagination.pageLinks.length <= 7);
  assert.ok(selected.pagination.pageLinks.some((link) => link.gap));
  for (const link of selected.pagination.pageLinks) {
    assert.equal(new URL(link.url, 'http://localhost').searchParams.get('q'), '<a & b>');
    assert.doesNotMatch(link.url, /[<>]/);
  }
});
