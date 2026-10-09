'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createStudentStore, StorageError, StudentIdExhaustedError } = require('../services/studentStore');
const { createApp } = require('../app');
const { CATALOG } = require('../services/studentCatalog');

const input = { name: 'Nguyễn Khóa Mới', email: 'cohort@example.com', className: '24CNTT1' };
async function fixture(t, fileSystem = fs) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'student-cohort-test-'));
  const filePath = path.join(directory, 'students.json');
  const statePath = path.join(directory, 'students.id-state.json');
  const markerPath = `${statePath}.initialized`;
  const store = createStudentStore({ filePath, fileSystem });
  await store.initialize();
  const server = createApp({ store, logger: { log() {}, error() {} } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('student-cohort-test-')) throw new Error('Unsafe cleanup');
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return { store, filePath, statePath, markerPath, base: `http://127.0.0.1:${server.address().port}` };
}
function request(base, route = '/students', body) {
  return new Promise((resolve, reject) => {
    const encoded = body === undefined ? '' : new URLSearchParams(body).toString();
    const req = http.request(new URL(route, base), { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : {
      'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(encoded),
    } }, (res) => {
      let html = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => html += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, html }));
    });
    req.on('error', reject);
    req.end(encoded);
  });
}

test('Mọi lớp suy ngành từ JSON, MSSV đúng0YY+5 số; các lớp cùng khóa chung counter', async (t) => {
  const { store, statePath } = await fixture(t);
  const before = await store.getAll();
  const ids = [];
  for (const [index, item] of CATALOG.classes.entries()) {
    const student = await store.add({ ...input, className: item.code, email: `cohort${index}@example.com` });
    assert.equal(student.major, item.majorCode);
    assert.equal(student.id.slice(0, 3), '0' + item.cohort);
    assert.equal(typeof student.id, 'string');
    assert.match(student.id, /^0[0-9]{7}$/);
    assert.deepEqual(Object.keys(student).sort(), ['className', 'email', 'id', 'major', 'name']);
    ids.push(student.id);
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes('02600011'));
  assert.deepEqual((await store.getAll()).slice(0, 40), before);
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  assert.equal(state.counters['024'], '10016');
  assert.equal(state.counters['025'], '00012');
  assert.equal(state.counters['026'], '00013');
});

test('HTTP đồng thời khác ngành cùng khóa và khác khóa:303, không mất/trùng, đúng major', async (t) => {
  const { base, store } = await fixture(t);
  const classes = ['24CNTT1', '24VL1', '25KHDL1', '26TOAN1'];
  const posts = await Promise.all(classes.map((className, index) => request(base, '/students', { ...input, className, email: `parallel${index}@example.com` })));
  assert.ok(posts.every((entry) => entry.status === 303));
  const all = await store.getAll();
  assert.equal(all.length, 44);
  assert.equal(new Set(all.map((item) => item.id)).size, 44);
  for (const item of all.slice(40)) {
    const klass = CATALOG.classes.find((entry) => entry.code === item.className);
    assert.equal(item.major, klass.majorCode);
    assert.equal(item.id.slice(0, 3), '0' + klass.cohort);
  }
});

test('Migration v1 giữ bytes sinh viên, max cũ/deleted02600011 và khởi động lại không giảm', async (t) => {
  const { filePath, statePath, markerPath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  await fs.writeFile(markerPath, '{"version":1}\n');
  await fs.writeFile(statePath, '{"version":1,"highWaterMark":"02600011"}\n');
  const restarted = createStudentStore({ filePath });
  await restarted.initialize();
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
  assert.deepEqual(JSON.parse(await fs.readFile(statePath, 'utf8')), {
    version: 2, legacyHighWaterMark: '02600011', counters: { '024': '10010', '025': '00010', '026': '00011' },
  });
  assert.equal(JSON.parse(await fs.readFile(markerPath, 'utf8')).version, 2);
  const first = await restarted.add({ ...input, className: '26TOAN1' });
  assert.equal(first.id, '02600012');
  await restarted.remove(first.id);
  const again = createStudentStore({ filePath });
  await again.initialize();
  assert.equal((await again.add({ ...input, className: '26TOAN2', email: 'restart@example.com' })).id, '02600013');
});

test('State cũ chưa ghi02600011 vẫn đặt floor11; max đã biết của khóa25 không giảm', async (t) => {
  const { filePath, statePath, markerPath } = await fixture(t);
  await fs.writeFile(markerPath, '{"version":1}');
  await fs.writeFile(statePath, '{"version":1,"highWaterMark":"02500999"}');
  const migrated = createStudentStore({ filePath });
  await migrated.initialize();
  assert.equal((await migrated.add({ ...input, className: '25KHDL1' })).id, '02501000');
  assert.equal((await migrated.add({ ...input, className: '26TOAN1', email: 'floor@example.com' })).id, '02600012');
});

test('Khóa mới khai báo trong state và countercao v2 được giữ, không giảm khi reconcile', async (t) => {
  const { filePath, statePath } = await fixture(t);
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  state.counters['024'] = '50000';
  state.counters['027'] = '00123';
  await fs.writeFile(statePath, JSON.stringify(state));
  const restarted = createStudentStore({ filePath });
  await restarted.initialize();
  assert.equal((await restarted.add(input)).id, '02450001');
  assert.equal(JSON.parse(await fs.readFile(statePath, 'utf8')).counters['027'], '00123');
});

test('Hết5 chữ số chỉ chặn khóa đó; các khóa khác vẫn cấp mã', async (t) => {
  const { store, filePath, statePath } = await fixture(t);
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  state.counters['024'] = '99999';
  await fs.writeFile(statePath, JSON.stringify(state));
  const before = await fs.readFile(filePath, 'utf8');
  await assert.rejects(store.add(input), StudentIdExhaustedError);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
  assert.equal((await store.add({ ...input, className: '25KHDL1' })).id, '02500011');
});

test('Form ba trường/popup; id/major giả mạo bị422, giữ input và không ghi cảstate', async (t) => {
  const { base, filePath, statePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  const counter = await fs.readFile(statePath, 'utf8');
  const get = await request(base);
  const form = get.html.match(/<form class="create-form"[\s\S]*?<\/form>/)[0];
  assert.doesNotMatch(form, /name="(?:id|major)"/);
  assert.match(form, /26TOAN1 — Toán học/);
  assert.match(get.html, /id="filter-major" name="major"/);
  assert.match(get.html, /popover="auto"/);
  for (const extra of [{ major: 'TOAN' }, { major: 'CNTT' }, { major: '' }, { id: '' }, { id: '02499999', major: 'VL' }]) {
    const post = await request(base, '/students', { ...input, ...extra });
    assert.equal(post.status, 422);
    assert.match(post.html, /Không được gửi trường (?:id|major)/);
    assert.match(post.html, /form-error-panel/);
    assert.match(post.html, /value="24CNTT1" selected/);
    assert.equal(await fs.readFile(filePath, 'utf8'), before);
    assert.equal(await fs.readFile(statePath, 'utf8'), counter);
  }
});

test('Statev2 hỏng/mất hoặc bịhạ vềv1: mutation/restart từ chối, không reset', async (t) => {
  const { store, filePath, statePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  const valid = JSON.parse(await fs.readFile(statePath, 'utf8'));
  for (const state of [
    { ...valid, counters: {} }, { ...valid, counters: { '024': 10011 } },
    { ...valid, counters: { '024': '100000' } }, { ...valid, counters: { 'BAD': '00001' } },
    { ...valid, counters: [] }, { version: 1, highWaterMark: '02600011' }, null,
  ]) {
    if (state === null) await fs.unlink(statePath);
    else await fs.writeFile(statePath, JSON.stringify(state));
    await assert.rejects(store.add(input), StorageError);
    await assert.rejects(store.remove('02400001'), StorageError);
    await assert.rejects(createStudentStore({ filePath }).initialize(), StorageError);
    assert.equal(await fs.readFile(filePath, 'utf8'), before);
  }
});

test('Migration lỗi ghi giữ statev1 để retry; crash giữa statev2/marker hoàn tất an toàn', async (t) => {
  const { filePath, statePath, markerPath } = await fixture(t);
  const legacy = '{"version":1,"highWaterMark":"02600011"}';
  await fs.writeFile(statePath, legacy);
  await fs.writeFile(markerPath, '{"version":1}');
  const failing = createStudentStore({ filePath, fileSystem: { ...fs, rename: async (from, to) => {
    if (to === statePath) throw new Error('Test migration failure');
    return fs.rename(from, to);
  } } });
  await assert.rejects(failing.initialize(), StorageError);
  assert.equal(await fs.readFile(statePath, 'utf8'), legacy);
  const partial = createStudentStore({ filePath, fileSystem: { ...fs, rename: async (from, to) => {
    if (to === markerPath) throw new Error('Test interrupted marker commit');
    return fs.rename(from, to);
  } } });
  await assert.rejects(partial.initialize(), StorageError);
  assert.equal(JSON.parse(await fs.readFile(statePath, 'utf8')).version, 2);
  assert.equal(JSON.parse(await fs.readFile(markerPath, 'utf8')).version, 1);
  const repaired = createStudentStore({ filePath });
  await repaired.initialize();
  assert.equal((await repaired.add({ ...input, className: '26TOAN1' })).id, '02600012');
});

test('Thêm khóa27 vào danh mục: khởi động tạo counterriêng, cấp02700001 và suyngành', async (t) => {
  const { filePath, statePath } = await fixture(t);
  const catalogPath = path.join(path.dirname(filePath), 'classes.json');
  await fs.writeFile(catalogPath, JSON.stringify([
    ...CATALOG.classes, { code: '27C11', name: '27C11', majorCode: 'CNTT', cohort: '27' },
  ]));
  // Module cache chỉ thay trong tiến trình con kiểm thử, không đổi cấu hình app thật.
  const script = `
    const catalog = require('./services/studentCatalog');
    require.cache[require.resolve('./services/studentCatalog')].exports = {
      ...catalog, CATALOG: catalog.loadCatalog({classesPath:process.argv[2]})
    };
    const {createStudentStore}=require('./services/studentStore');
    (async()=>{
      const store=createStudentStore({filePath:process.argv[1]});
      await store.initialize();
      console.log(JSON.stringify(await store.add({name:'Khóa mới',email:'new27@example.com',className:'27C11'})));
    })().catch(error=>{console.error(error);process.exitCode=1});
  `;
  const { stdout } = await promisify(execFile)(process.execPath, ['-e', script, filePath, catalogPath], {
    cwd: path.join(__dirname, '..'), windowsHide: true, timeout: 15000,
  });
  const student = JSON.parse(stdout);
  assert.equal(student.id, '02700001');
  assert.equal(student.major, 'CNTT');
  assert.equal(JSON.parse(await fs.readFile(statePath, 'utf8')).counters['027'], '00001');
});

test('Mất đồng thời state/marker trên kho có hồ sơ: không bootstrap lại hoặc reset lịch sử', async (t) => {
  const { filePath, statePath, markerPath, store } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  await fs.unlink(statePath);
  await fs.unlink(markerPath);
  await assert.rejects(store.add(input), StorageError);
  await assert.rejects(createStudentStore({ filePath }).initialize(), StorageError);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
  await assert.rejects(fs.readFile(statePath), { code: 'ENOENT' });
  await assert.rejects(fs.readFile(markerPath), { code: 'ENOENT' });
});
