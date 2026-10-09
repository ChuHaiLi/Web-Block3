'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { loadCatalog, CATALOG } = require('../services/studentCatalog');
const { validateNewStudent } = require('../validators/studentValidator');

const valid = { name: 'Nguyễn An', email: 'catalog@example.com', className: '24C11', major: 'CNTT' };

test('Danh mục độc lập có bốn ngành/mười lớp, kế thừa seed và hai lớp demo', async () => {
  assert.equal(Object.keys(CATALOG.majors).length, 4);
  assert.equal(CATALOG.classes.length, 10);
  const current = [
    ...JSON.parse(await fs.readFile(path.join(__dirname, '../data/students.seed.json'), 'utf8')),
    { className: '24CNTT', major: 'CNTT' }, { className: '24C11', major: 'CNTT' },
  ];
  for (const student of current) {
    assert.ok(CATALOG.classes.some((item) => item.code === student.className && item.major === student.major));
    assert.ok(Object.hasOwn(CATALOG.majors, student.major));
  }
  assert.ok(CATALOG.classes.some((item) => item.code === '24C11' && item.major === 'CNTT'));
  assert.ok(CATALOG.classes.some((item) => item.code === '24CNTT' && item.major === 'CNTT'));
});

test('POST chỉ chấp nhận cặp lớp/ngành có trong JSON; giữ giá trị khi chọn sai', () => {
  for (const item of CATALOG.classes) {
    assert.equal(validateNewStudent({ ...valid, className: item.code, major: item.major }).isValid, true);
  }
  for (const input of [{ ...valid, className: 'LOP-MOI' }, { ...valid, className: '__proto__' },
    { ...valid, className: '24C11', major: 'KHDL' }]) {
    const result = validateNewStudent(input);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.className);
    assert.equal(result.values.className, input.className);
    assert.equal(result.values.major, input.major);
  }
  assert.equal(validateNewStudent({ ...valid, className: ' 24C11 ' }).isValid, true);
});

test('Danh mục JSON hỏng, rỗng, mã trùng hoặc quan hệ sai bị phát hiện, không tự ghi đè', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'student-catalog-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const majorsPath = path.join(directory, 'majors.json');
  const classesPath = path.join(directory, 'classes.json');
  const goodMajor = { code: 'CNTT', name: 'Công nghệ thông tin' };
  const goodClass = { code: '24C11', major: 'CNTT' };
  for (const [majors, classes] of [
    [[goodMajor, goodMajor], [goodClass]], [[goodMajor], [goodClass, goodClass]],
    [[goodMajor], [{ ...goodClass, major: 'OTHER' }]], [[], [goodClass]],
    [[goodMajor], []], [[{ ...goodMajor, code: '__proto__' }], [goodClass]],
    [[goodMajor], [{ ...goodClass, code: 'x'.repeat(31) }]],
    [[goodMajor], [{ ...goodClass, code: ' 24C11' }]],
    [[goodMajor], [{ ...goodClass, extra: 'unexpected' }]],
  ]) {
    await fs.writeFile(majorsPath, JSON.stringify(majors), 'utf8');
    await fs.writeFile(classesPath, JSON.stringify(classes), 'utf8');
    assert.throws(() => loadCatalog({ majorsPath, classesPath }));
    assert.equal(await fs.readFile(classesPath, 'utf8'), JSON.stringify(classes));
  }
  await fs.writeFile(majorsPath, '{broken', 'utf8');
  assert.throws(() => loadCatalog({ majorsPath, classesPath }));
  assert.equal(await fs.readFile(majorsPath, 'utf8'), '{broken');
});
