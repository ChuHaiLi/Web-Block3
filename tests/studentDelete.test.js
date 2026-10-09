'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { createApp } = require('../app');
const { createStudentStore, StudentNotFoundError, StorageError } = require('../services/studentStore');

const seedPath = path.join(__dirname, '../data/students.seed.json');
const input = { name: 'Nguyễn Kiểm Thử', email: 'delete-test@example.com', className: '26TOAN1' };

async function fixture(t, fileSystem = fs, { initialize = true } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'student-delete-test-'));
  const filePath = path.join(directory, 'students.json');
  const statePath = path.join(directory, 'students.id-state.json');
  const markerPath = `${statePath}.initialized`;
  const store = createStudentStore({ filePath, seedPath, fileSystem });
  if (initialize) await store.initialize();
  const app = createApp({ store, logger: { log() {}, error() {} } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) ||
        !path.basename(directory).startsWith('student-delete-test-')) throw new Error('Đường dẫn cleanup không an toàn.');
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { filePath, statePath, markerPath, store, base: `http://127.0.0.1:${server.address().port}` };
}

function request(base, route, method = 'GET', body = '') {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(route, base), { method, headers: method === 'POST' ? {
      'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body),
    } : {} }, (res) => {
      let html = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => html += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, html }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('GET xác nhận đúng năm trường, POST form và Hủy; GET/Hủy không đổi JSON hoặc bộ đếm', async (t) => {
  const { store, base, filePath, statePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  const stateBefore = await fs.readFile(statePath, 'utf8');
  const page = await request(base, '/students/02400001/delete');
  assert.equal(page.status, 200);
  for (const value of ['02400001', 'Nguyễn Minh An', 'minh.an01@example.com', '24CNTT1', 'Công nghệ thông tin']) {
    assert.ok(page.html.includes(value), value);
  }
  assert.match(page.html, /Bạn có chắc chắn muốn xóa sinh viên này\? Hành động này không thể hoàn tác\./);
  assert.match(page.html, /action="\/students\/02400001\/delete" method="post"/);
  assert.match(page.html, /href="\/students">Hủy/);
  assert.doesNotMatch(page.html, /<script\b|\bconfirm\s*\(|\bfetch\s*\(/i);
  assert.equal((await request(base, '/students')).status, 200);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
  assert.equal(await fs.readFile(statePath, 'utf8'), stateBefore);
  assert.equal((await store.getAll()).length, 40);
});

test('POST xóa đúng một mã URL, bỏ qua ID khác trong body, 303; redirect/refresh không xóa thêm', async (t) => {
  const { store, base, filePath } = await fixture(t);
  const before = await store.getAll();
  const post = await request(base, '/students/02400001/delete', 'POST', 'id=02400002&id=02400003');
  assert.equal(post.status, 303);
  assert.equal(post.headers.location, '/students?deleted=1');
  assert.deepEqual(await store.getAll(), before.filter((item) => item.id !== '02400001'));
  const saved = await fs.readFile(filePath, 'utf8');
  for (let refresh = 0; refresh < 3; refresh++) {
    const page = await request(base, post.headers.location);
    assert.equal(page.status, 200);
    assert.match(page.html, /Đã xóa sinh viên thành công/);
    assert.doesNotMatch(page.html, /class="student-id">02400001</);
    assert.match(page.html, /Tìm thấy <strong>39<\/strong>/);
  }
  assert.equal((await request(base, '/students/02400001/delete', 'POST')).status, 404);
  assert.equal(await fs.readFile(filePath, 'utf8'), saved);
});

test('ID không tồn tại trả404, ID URL bất thường trả400, không thay đổi dữ liệu/path', async (t) => {
  const { base, filePath, statePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  const stateBefore = await fs.readFile(statePath, 'utf8');
  for (const method of ['GET', 'POST']) {
    assert.equal((await request(base, '/students/NO-SUCH-ID/delete', method)).status, 404);
    for (const id of ['abc', 'a'.repeat(21), '%2e%2e%2fdata', 'ABCD%5Cdata', 'ID%00BAD', '%C4%901234']) {
      const response = await request(base, `/students/${id}/delete`, method);
      assert.equal(response.status, 400, id);
      assert.doesNotMatch(response.html, /studentStore\.js|<pre>|SyntaxError/);
    }
  }
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
  assert.equal(await fs.readFile(statePath, 'utf8'), stateBefore);
});

test('Tên HTML nguy hiểm được escape trong trang xác nhận và nút danh sách', async (t) => {
  const { store, base, filePath } = await fixture(t);
  const added = await store.add({ ...input, name: '<script>alert("xss")</script>' });
  const before = await fs.readFile(filePath, 'utf8');
  const page = await request(base, `/students/${added.id}/delete`);
  assert.equal(page.status, 200);
  assert.match(page.html, /&lt;script&gt;alert\(&#34;xss&#34;\)&lt;\/script&gt;/);
  assert.doesNotMatch(page.html, /<script\b/);
  const list = await request(base, '/students?page=3');
  assert.match(list.html, /aria-label="Xóa sinh viên &lt;script&gt;/);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
});

test('Nút Xóa xuất hiện khi tìm/lọc/phân trang; xóa cuối trang cuối tính lại về trang có dữ liệu', async (t) => {
  const { store, base } = await fixture(t);
  const added = await store.add(input);
  const filtered = await request(base, `/students?q=${added.id}&className=26TOAN1&major=TOAN`);
  assert.match(filtered.html, new RegExp(`href="/students/${added.id}/delete"`));
  assert.match((await request(base, '/students?page=3')).html, new RegExp(`href="/students/${added.id}/delete"`));
  assert.equal((await request(base, `/students/${added.id}/delete`, 'POST')).status, 303);
  const last = await request(base, '/students?page=3');
  assert.equal(last.status, 200);
  assert.match(last.html, /Trang <strong>2<\/strong> \/ 2/);
  assert.equal((last.html.match(/scope="row"/g) || []).length, 20);
  const missing = await request(base, `/students?q=${added.id}`);
  assert.match(missing.html, /Không tìm thấy sinh viên phù hợp/);
  assert.equal((await request(base, '/students?q=nguyen&className=24CNTT1&major=CNTT')).status, 200);
});

test('Xóa max, restart store, thêm tiếp không dùng lại mã đã xóa; xóa hết không seed/reset mã', async (t) => {
  const { store, filePath, statePath } = await fixture(t);
  await store.remove('02600010');
  const restarted = createStudentStore({ filePath, seedPath });
  await restarted.initialize();
  const first = await restarted.add(input);
  assert.equal(first.id, '02600012');
  await restarted.remove(first.id);
  const nextStore = createStudentStore({ filePath, seedPath });
  await nextStore.initialize();
  assert.equal((await nextStore.add({ ...input, email: 'next-delete@example.com' })).id, '02600013');
  for (const student of await nextStore.getAll()) await nextStore.remove(student.id);
  const emptyRestart = createStudentStore({ filePath, seedPath });
  await emptyRestart.initialize();
  assert.deepEqual(await emptyRestart.getAll(), []);
  assert.equal(JSON.parse(await fs.readFile(statePath, 'utf8')).counters['026'], '00013');
  assert.equal((await emptyRestart.add({ ...input, email: 'after-empty@example.com' })).id, '02600014');
});

test('Xóa/thêm đồng thời cùng hàng đợi: giữ mọi hồ sơ khác và MSSV duy nhất', async (t) => {
  const { store } = await fixture(t);
  const before = await store.getAll();
  const [removed, first, second] = await Promise.all([
    store.remove('02600010'), store.add(input), store.add({ ...input, email: 'concurrent-delete@example.com' }),
  ]);
  assert.equal(removed.id, '02600010');
  assert.deepEqual([first.id, second.id], ['02600012', '02600013']);
  const after = await store.getAll();
  assert.deepEqual(after.slice(0, 39), before.filter((item) => item.id !== '02600010'));
  assert.equal(after.length, 41);
  assert.equal(new Set(after.map((item) => item.id)).size, 41);
});

test('Hai POST xóa cùng mã: một303/một404, không mất hồ sơ khác', async (t) => {
  const { base, store } = await fixture(t);
  const result = await Promise.all([request(base, '/students/02400001/delete', 'POST'), request(base, '/students/02400001/delete', 'POST')]);
  assert.deepEqual(result.map((entry) => entry.status).sort(), [303, 404]);
  assert.equal((await store.getAll()).length, 39);
});

test('Lỗi ghi xóa:500, không redirect/thông báo thành công, JSON nguyên vẹn; retry sau lỗi hoạt động', async (t) => {
  let fail = false;
  const fileSystem = { ...fs, rename: async (from, to) => {
    if (fail && to.endsWith('students.json')) throw Object.assign(new Error('Mô phỏng lỗi ghi'), { code: 'EACCES' });
    return fs.rename(from, to);
  } };
  const { base, store, filePath, statePath } = await fixture(t, fileSystem);
  const before = await fs.readFile(filePath, 'utf8');
  const stateBefore = await fs.readFile(statePath, 'utf8');
  fail = true;
  const response = await request(base, '/students/02600010/delete', 'POST');
  assert.equal(response.status, 500);
  assert.equal(response.headers.location, undefined);
  assert.doesNotMatch(response.html, /Đã xóa sinh viên thành công|EACCES|<pre>/);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
  assert.equal(await fs.readFile(statePath, 'utf8'), stateBefore);
  fail = false;
  assert.equal((await store.remove('02600010')).id, '02600010');
});

test('Ghi sinh viên thất bại sau reserve: mã bị bỏ qua và không tái sử dụng sau restart', async (t) => {
  let fail = false;
  const fileSystem = { ...fs, rename: async (from, to) => {
    if (fail && to.endsWith('students.json')) throw Object.assign(new Error('Mô phỏng lỗi dữ liệu sau reserve'), { code: 'EACCES' });
    return fs.rename(from, to);
  } };
  const { store, filePath, statePath } = await fixture(t, fileSystem);
  const before = await fs.readFile(filePath, 'utf8');
  fail = true;
  await assert.rejects(store.add(input), StorageError);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
  assert.equal(JSON.parse(await fs.readFile(statePath, 'utf8')).counters['026'], '00012');
  const restarted = createStudentStore({ filePath, seedPath });
  await restarted.initialize();
  assert.equal((await restarted.add(input)).id, '02600013');
});

test('Ghi trạng thái thất bại: không ghi sinh viên, state cũ giữ nguyên', async (t) => {
  let fail = false;
  const fileSystem = { ...fs, rename: async (from, to) => {
    if (fail && to.endsWith('.id-state.json')) throw Object.assign(new Error('Mô phỏng lỗi state'), { code: 'EACCES' });
    return fs.rename(from, to);
  } };
  const { store, filePath, statePath } = await fixture(t, fileSystem);
  const before = await fs.readFile(filePath, 'utf8');
  const stateBefore = await fs.readFile(statePath, 'utf8');
  fail = true;
  await assert.rejects(store.add(input), StorageError);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
  assert.equal(await fs.readFile(statePath, 'utf8'), stateBefore);
  fail = false;
  assert.equal((await store.add(input)).id, '02600012');
});

test('State hỏng/mất sau khởi tạo: thêm/xóa và restart từ chối, không tự reset', async (t) => {
  const { store, filePath, statePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  for (const state of ['{broken', '{}', '{"version":1,"highWaterMark":2600010}', '{"version":1,"highWaterMark":"-1"}', null]) {
    if (state === null) await fs.unlink(statePath);
    else await fs.writeFile(statePath, state, 'utf8');
    await assert.rejects(store.add(input), StorageError);
    await assert.rejects(store.remove('02600010'), StorageError);
    await assert.rejects(createStudentStore({ filePath, seedPath }).initialize(), StorageError);
    assert.equal(await fs.readFile(filePath, 'utf8'), before);
    if (state === null) await assert.rejects(fs.readFile(statePath), { code: 'ENOENT' });
    else assert.equal(await fs.readFile(statePath, 'utf8'), state);
  }
});

test('Marker mất hoặc dữ liệu mất sau bootstrap: restart từ chối, không tạo lại marker/seed', async (t) => {
  const { filePath, markerPath, statePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  const marker = await fs.readFile(markerPath, 'utf8');
  const state = await fs.readFile(statePath, 'utf8');
  await fs.unlink(markerPath);
  await assert.rejects(createStudentStore({ filePath, seedPath }).initialize(), StorageError);
  await assert.rejects(fs.readFile(markerPath), { code: 'ENOENT' });
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
  await fs.writeFile(markerPath, marker, 'utf8');
  await fs.unlink(filePath);
  await assert.rejects(createStudentStore({ filePath, seedPath }).initialize(), StorageError);
  await assert.rejects(fs.readFile(filePath), { code: 'ENOENT' });
  assert.equal(await fs.readFile(statePath, 'utf8'), state);
});

test('Bootstrap bị ngắt sau marker: lần khởi động tiếp theo dừng, không suy lại max', async (t) => {
  const fileSystem = { ...fs, rename: async (from, to) => {
    if (to.endsWith('.id-state.json')) throw Object.assign(new Error('Mô phỏng ngắt bootstrap'), { code: 'EACCES' });
    return fs.rename(from, to);
  } };
  const { store, filePath, statePath, markerPath } = await fixture(t, fileSystem, { initialize: false });
  await assert.rejects(store.initialize(), StorageError);
  const before = await fs.readFile(filePath, 'utf8');
  assert.equal(JSON.parse(await fs.readFile(markerPath, 'utf8')).version, 1);
  await assert.rejects(fs.readFile(statePath), { code: 'ENOENT' });
  await assert.rejects(createStudentStore({ filePath, seedPath }).initialize(), StorageError);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
});

test('ID cũ dạng chữ/gạch nối được xác nhận và xóa đúng, không đổi MSSV hồ sơ khác', async (t) => {
  const { store, filePath, base } = await fixture(t);
  await fs.writeFile(filePath, JSON.stringify([
    { id: 'sv-0001', ...input, major: 'TOAN' }, { id: '2222', ...input, major: 'TOAN', email: 'legacy-short@example.com' },
  ]), 'utf8');
  assert.equal((await request(base, '/students/SV-0001/delete')).status, 200);
  assert.equal((await store.remove('SV-0001')).id, 'sv-0001');
  assert.equal((await store.getAll())[0].id, '2222');
  await assert.rejects(store.remove('SV-0001'), StudentNotFoundError);
});

test('Tiến trình thực bị ngắt sau reserve: restart không cấp lại mã; xóa max rồi restart vẫn tăng', async (t) => {
  const { filePath, statePath } = await fixture(t);
  const children = [];
  t.after(async () => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, 'exit');
    }
  });
  const script = `
    const fs=require('node:fs/promises');
    const {createStudentStore}=require('./services/studentStore');
    (async()=>{
      const target=process.argv[1];
      const mode=process.argv[2];
      const fileSystem={...fs,rename:async(from,to)=>{
        if(mode==='crash'&&to===target){process.send({reserved:true});await new Promise(()=>{});}
        return fs.rename(from,to);
      }};
      const store=createStudentStore({filePath:target,fileSystem});
      await store.initialize();
      if(mode==='delete') { await store.remove('02600013'); process.send({deleted:true}); return; }
      const student=await store.add(${JSON.stringify(input)});
      process.send({id:student.id});
    })().catch(error=>{console.error(error);process.exit(1)});
  `;
  async function launch(mode) {
    const child = spawn(process.execPath, ['-e', script, filePath, mode], {
      cwd: path.join(__dirname, '..'), stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true,
    });
    children.push(child);
    const [message] = await once(child, 'message', { signal: AbortSignal.timeout(15000) });
    return { child, message };
  }
  const crash = await launch('crash');
  assert.equal(crash.message.reserved, true);
  assert.equal(JSON.parse(await fs.readFile(statePath, 'utf8')).counters['026'], '00012');
  crash.child.kill();
  await once(crash.child, 'exit');
  const restart = await launch('add');
  assert.equal(restart.message.id, '02600013');
  await once(restart.child, 'exit');
  const deletion = await launch('delete');
  assert.equal(deletion.message.deleted, true);
  await once(deletion.child, 'exit');
  const afterDelete = await launch('add');
  assert.equal(afterDelete.message.id, '02600014');
  await once(afterDelete.child, 'exit');
});
