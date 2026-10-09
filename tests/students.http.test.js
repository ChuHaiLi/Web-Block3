'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { createApp } = require('../app');
const { createStudentStore, StorageError } = require('../services/studentStore');

const seedPath = path.join(__dirname, '../data/students.seed.json');
const valid = { name: '  Nguyễn   Ánh Dương  ', email: 'New.Student@EXAMPLE.COM', className: '24CNTT1', major: 'CNTT' };

// HTTP trực tiếp trong Node, không phải JavaScript chạy trên trình duyệt.
function request(base, pathname = '/students', { method = 'GET', body = '', type = 'application/x-www-form-urlencoded' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(pathname, base), {
      method, headers: method === 'POST' ? { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) } : {},
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, html: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'student-http-test-'));
  const filePath = path.join(directory, 'students.json');
  const store = createStudentStore({ filePath, seedPath });
  await store.initialize();
  const logs = [];
  const app = createApp({ store: options.store || store, logger: { log: (line) => logs.push(line), error: (line) => logs.push(line) } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { filePath, store, logs, base: `http://127.0.0.1:${server.address().port}` };
}

test('GET 200: kho có 40, trang đầu 20 sinh viên, năm trường và cột thao tác, không ID/script', async (t) => {
  const { base, store, logs } = await fixture(t);
  const response = await request(base);
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /text\/html.*utf-8/i);
  assert.match(response.html, /Nguyễn Minh An/);
  assert.match(response.html, /minh\.an01@example\.com/);
  assert.equal((response.html.match(/scope="row"/g) || []).length, 20);
  assert.match(response.html, /Trang <strong>1<\/strong> \/ 2/);
  assert.match(response.html, /<select id="className" name="className"/);
  assert.doesNotMatch(response.html, /<input id="className"/);
  assert.equal((response.html.match(/scope="col"/g) || []).length, 6);
  assert.match(response.html, /href="\/students\/02400001\/delete"/);
  assert.match(response.html, /action="\/students" method="post"/);
  assert.match(response.html, /action="\/students" method="get"/);
  assert.doesNotMatch(response.html, /name="id"/);
  for (const field of Object.keys(valid)) assert.match(response.html, new RegExp(`name="${field}"`));
  assert.doesNotMatch(response.html, /<script\b|\bfetch\s*\(|XMLHttpRequest/i);
  assert.match(response.headers['content-security-policy'], /script-src 'none'/);
  assert.equal((await store.getAll()).length, 40);
  assert.ok(logs.some((line) => line.includes('GET /students 200')));
});

test('POST hợp lệ lưu JSON, trả 303; GET đích và refresh không thêm trùng', async (t) => {
  const { base, filePath, logs } = await fixture(t);
  const post = await request(base, '/students', { method: 'POST', body: new URLSearchParams(valid).toString() });
  assert.equal(post.status, 303);
  assert.equal(post.headers.location, '/students?created=02600011&page=3');
  const records = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(records.length, 41);
  assert.deepEqual(records.at(-1), { id: '02600011', ...valid, name: 'Nguyễn Ánh Dương', email: 'New.Student@example.com' });
  const after = await fs.readFile(filePath, 'utf8');
  for (let refresh = 0; refresh < 3; refresh++) {
    const page = await request(base, post.headers.location);
    assert.equal(page.status, 200);
    assert.match(page.html, /Nguyễn Ánh Dương/);
    assert.match(page.html, /Đã thêm sinh viên thành công/);
  }
  assert.equal(await fs.readFile(filePath, 'utf8'), after);
  assert.ok(logs.some((line) => line.includes('POST /students 303')));
  assert.ok(logs.every((line) => !line.includes(valid.email)));
});

test('Thiếu trường, email sai/trùng và ngành lạ: 422, không ghi file', async (t) => {
  const { base, filePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  const cases = [
    [{ ...valid, name: '' }, 'name'],
    [{ ...valid, email: '' }, 'email'], [{ ...valid, className: '' }, 'className'],
    [{ ...valid, major: '' }, 'major'], [{ ...valid, email: 'sai-email' }, 'email'],
    [{ ...valid, email: 'MINH.AN01@EXAMPLE.COM' }, 'email'],
    [{ ...valid, major: '__proto__' }, 'major'],
    [{ ...valid, name: 'Á'.repeat(101) }, 'name'], [{ ...valid, className: 'A'.repeat(31) }, 'className'],
  ];
  for (const [body, field] of cases) {
    const response = await request(base, '/students', { method: 'POST', body: new URLSearchParams(body).toString() });
    assert.equal(response.status, 422, field);
    assert.match(response.html, new RegExp(`id="${field}-error"`));
    assert.equal(await fs.readFile(filePath, 'utf8'), before);
  }
  const preserved = await request(base, '/students', { method: 'POST', body: new URLSearchParams({ ...valid, email: 'bad' }).toString() });
  assert.match(preserved.html, /value="Nguyễn Ánh Dương"/);
  assert.match(preserved.html, /value="CNTT" selected/);
});

test('Escape chuỗi HTML nguy hiểm cả trong form lỗi và danh sách SSR', async (t) => {
  const { base } = await fixture(t);
  const attack = '<script>alert("xss")</script>';
  const errorPage = await request(base, '/students', {
    method: 'POST', body: new URLSearchParams({ ...valid, name: attack, email: 'bad' }).toString(),
  });
  assert.equal(errorPage.status, 422);
  assert.match(errorPage.html, /&lt;script&gt;alert\(&#34;xss&#34;\)&lt;\/script&gt;/);
  assert.doesNotMatch(errorPage.html, /<script>/);
  const post = await request(base, '/students', { method: 'POST', body: new URLSearchParams({ ...valid, name: attack }).toString() });
  assert.equal(post.status, 303);
  const page = await request(base, post.headers.location);
  assert.match(page.html, /&lt;script&gt;/);
  assert.doesNotMatch(page.html, /<script>/);
});

test('Sai kiểu, body quá lớn, quá nhiều tham số và Content-Type sai không thay đổi file', async (t) => {
  const { base, filePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  const repeated = new URLSearchParams(valid);
  repeated.append('name', 'Another');
  assert.equal((await request(base, '/students', { method: 'POST', body: repeated.toString() })).status, 422);
  assert.equal((await request(base, '/students', { method: 'POST', body: 'name=' + 'a'.repeat(17000) })).status, 413);
  assert.equal((await request(base, '/students', { method: 'POST', body: new URLSearchParams(Array.from({ length: 21 }, (_, i) => [`x${i}`, 'a'])).toString() })).status, 413);
  assert.equal((await request(base, '/students', { method: 'POST', body: JSON.stringify(valid), type: 'application/json' })).status, 415);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
});

test('Hai POST đồng thời cấp ID khác nhau; email trùng chỉ một POST thành công', async (t) => {
  const { base, filePath } = await fixture(t);
  const post = (body) => request(base, '/students', { method: 'POST', body: new URLSearchParams(body).toString() });
  const different = await Promise.all([post(valid), post({ ...valid, email: 'other@example.com' })]);
  assert.deepEqual(different.map((x) => x.status), [303, 303]);
  assert.equal(new Set(different.map((x) => x.headers.location)).size, 2);
  const same = await Promise.all([
    post({ ...valid, email: 'same@example.com' }),
    post({ ...valid, email: 'SAME@EXAMPLE.COM' }),
  ]);
  assert.deepEqual(same.map((x) => x.status).sort(), [303, 422]);
  assert.equal(JSON.parse(await fs.readFile(filePath, 'utf8')).length, 43);
  const records = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(new Set(records.map((record) => record.id)).size, 43);
});

test('Empty state, 404, lỗi đọc và lỗi lưu đều trả HTML phù hợp', async (t) => {
  const { base, filePath } = await fixture(t);
  await fs.writeFile(filePath, '[]\n', 'utf8');
  const empty = await request(base);
  assert.equal(empty.status, 200);
  assert.match(empty.html, /Chưa có sinh viên/);
  assert.equal((await request(base, '/does-not-exist')).status, 404);
  await fs.writeFile(filePath, '{broken', 'utf8');
  const broken = await request(base);
  assert.equal(broken.status, 500);
  assert.doesNotMatch(broken.html, /SyntaxError|studentStore\.js|<pre>/);
  const brokenPost = await request(base, '/students', { method: 'POST', body: new URLSearchParams(valid).toString() });
  assert.equal(brokenPost.status, 500);
  assert.equal(await fs.readFile(filePath, 'utf8'), '{broken');
  const fail = await fixture(t, { store: {
    getAll: async () => [], add: async () => { throw new StorageError('Lỗi ghi trong test', { code: 'EACCES' }); },
  } });
  assert.equal((await request(fail.base, '/students', { method: 'POST', body: new URLSearchParams(valid).toString() })).status, 500);
});

test('Dữ liệu tồn tại sau khi dừng và khởi động lại tiến trình Node.js thực tế', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'student-process-test-'));
  const filePath = path.join(directory, 'students.json');
  const children = [];
  t.after(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await once(child, 'exit');
      }
    }
    await fs.rm(directory, { recursive: true, force: true });
  });
  const script = `
    const {createStudentStore}=require('./services/studentStore');
    const {createApp}=require('./app');
    (async()=>{
      const store=createStudentStore({filePath:process.argv[1],seedPath:process.argv[2]});
      await store.initialize();
      const app=createApp({store,logger:{log(){},error(){}}});
      const server=app.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
    })().catch(error=>{console.error(error);process.exit(1)});
  `;
  async function launch() {
    const child = spawn(process.execPath, ['-e', script, filePath, seedPath], {
      cwd: path.join(__dirname, '..'), stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true,
    });
    children.push(child);
    const [message] = await once(child, 'message', { signal: AbortSignal.timeout(15000) });
    return { child, base: `http://127.0.0.1:${message.port}` };
  }
  const first = await launch();
  assert.equal((await request(first.base)).status, 200);
  assert.equal((await request(first.base, '/students', { method: 'POST', body: new URLSearchParams(valid).toString() })).status, 303);
  const before = await fs.readFile(filePath, 'utf8');
  first.child.kill();
  await once(first.child, 'exit');
  const second = await launch();
  const page = await request(second.base, '/students?page=3');
  assert.equal(page.status, 200);
  assert.match(page.html, /Nguyễn Ánh Dương/);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
  assert.equal(JSON.parse(before).length, 41);
  const postRestart = await request(second.base, '/students', {
    method: 'POST', body: new URLSearchParams({ ...valid, email: 'restart-next@example.com' }).toString(),
  });
  assert.equal(postRestart.status, 303);
  assert.equal(postRestart.headers.location, '/students?created=02600012&page=3');
  assert.equal(JSON.parse(await fs.readFile(filePath, 'utf8')).length, 42);
});

test('Client không được đặt MSSV qua POST, kể cả id rỗng hoặc lặp', async (t) => {
  const { base, filePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  for (const id of ['02400001', '88888888', '']) {
    const response = await request(base, '/students', {
      method: 'POST', body: new URLSearchParams({ ...valid, id }).toString(),
    });
    assert.equal(response.status, 422);
    assert.match(response.html, /Không được gửi trường id/);
    assert.doesNotMatch(response.html, /name="id"/);
    assert.equal(await fs.readFile(filePath, 'utf8'), before);
  }
  const repeated = new URLSearchParams(valid);
  repeated.append('id', '1234');
  repeated.append('id', '5678');
  assert.equal((await request(base, '/students', { method: 'POST', body: repeated.toString() })).status, 422);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
});

test('Hết MSSV trả 409, giữ input và không ghi JSON', async (t) => {
  const { base, filePath } = await fixture(t);
  const exhausted = [{ id: '99999999', name: 'Nguyễn An', email: 'last@example.com', className: '24CNTT1', major: 'CNTT' }];
  const before = JSON.stringify(exhausted);
  await fs.writeFile(filePath, before, 'utf8');
  const response = await request(base, '/students', { method: 'POST', body: new URLSearchParams(valid).toString() });
  assert.equal(response.status, 409);
  assert.match(response.html, /đã hết phạm vi 8 chữ số/);
  assert.match(response.html, /value="Nguyễn Ánh Dương"/);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
});

function renderedIds(html) {
  return [...html.matchAll(/class="student-id">([^<]+)<\/th>/g)].map((match) => match[1]);
}

test('Tìm MSSV toàn bộ/một phần và tên đầy đủ/một phần, không phân biệt hoa/dấu', async (t) => {
  const { base, filePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  const cases = [
    ['02400001', ['02400001']],
    ['026000', Array.from({ length: 10 }, (_, i) => `026000${String(i + 1).padStart(2, '0')}`)],
    ['Nguyễn Minh An', ['02400001']], ['minh an', ['02400001']],
    ['NGUYEN', ['02400001', '02500001', '02600001', '02410001']],
    ['  nguyen  ', ['02400001', '02500001', '02600001', '02410001']],
    ['dang', ['02400006', '02500006', '02600006', '02410006']],
    ['Đặng'.normalize('NFD'), ['02400006', '02500006', '02600006', '02410006']],
  ];
  for (const [q, expected] of cases) {
    const response = await request(base, '/students?' + new URLSearchParams({ q }));
    assert.equal(response.status, 200, q);
    assert.deepEqual(renderedIds(response.html), expected, q);
    assert.equal(await fs.readFile(filePath, 'utf8'), before);
  }
});

test('Tìm tên hoặc MSSV dùng OR; không tìm theo email', async (t) => {
  const { base, store } = await fixture(t);
  const added = await store.add({ ...valid, name: 'Sinh viên 02400001', email: 'or-test@example.com' });
  const response = await request(base, '/students?q=02400001');
  assert.deepEqual(renderedIds(response.html), ['02400001', added.id]);
  const emailOnly = await request(base, '/students?q=or-test%40example.com');
  assert.deepEqual(renderedIds(emailOnly.html), []);
});

test('Lọc lớp/ngành, kết hợp bằng AND và giữ giá trị đã chọn', async (t) => {
  const { base, filePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  const cases = [
    [{ className: '24CNTT1' }, 5], [{ major: 'CNTT' }, 10],
    [{ className: '24CNTT1', major: 'CNTT' }, 5],
    [{ className: '24CNTT1', major: 'KHDL' }, 0],
    [{ q: 'nguyen', className: '24CNTT1', major: 'CNTT' }, 1],
    [{ q: '   ', className: '24CNTT1', major: 'CNTT' }, 5],
    [{ q: '', major: 'KHDL' }, 10],
  ];
  for (const [filters, count] of cases) {
    const response = await request(base, '/students?' + new URLSearchParams(filters));
    assert.equal(response.status, 200);
    assert.equal(renderedIds(response.html).length, count);
    assert.match(response.html, new RegExp(`Tìm thấy <strong>${count}<\/strong> / 40 sinh viên`));
    if (filters.className) assert.match(response.html, /value="24CNTT1" selected/);
    if (filters.major) assert.match(response.html, new RegExp(`value="${filters.major}" selected`));
    assert.equal(await fs.readFile(filePath, 'utf8'), before);
  }
  const response = await request(base, '/students?q=nguyen&className=24CNTT1&major=CNTT');
  assert.deepEqual(renderedIds(response.html), ['02400001']);
  assert.match(response.html, /value="nguyen"/);
  assert.match(response.html, /Từ khóa: nguyen/);
  assert.match(response.html, /href="\/students\?className=24CNTT1&amp;major=CNTT">Xóa tìm kiếm/);
});

test('Danh sách lớp lấy từ danh mục JSON, không phụ thuộc kết quả tìm kiếm', async (t) => {
  const { base, store } = await fixture(t);
  await store.add({ ...valid, className: '24C11', email: 'new-class@example.com' });
  const response = await request(base, '/students?q=zzzzzz');
  assert.match(response.html, /value="24C11"/);
  assert.match(response.html, /Tất cả lớp/);
  assert.match(response.html, /Tất cả ngành/);
  assert.match(response.html, /value="CNTT">Công nghệ thông tin/);
  const filtered = await request(base, '/students?className=24C11');
  assert.equal(renderedIds(filtered.html).length, 1);
});

test('Không kết quả khác danh sách rỗng; reset trả đủ dữ liệu và không ghi file', async (t) => {
  const { base, filePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  const missing = await request(base, '/students?q=khong-tim-thay');
  assert.match(missing.html, /Không tìm thấy sinh viên phù hợp/);
  assert.doesNotMatch(missing.html, /<h3>Chưa có sinh viên/);
  assert.match(missing.html, /href="\/students">Đặt lại bộ lọc/);
  const reset = await request(base);
  assert.equal(renderedIds(reset.html).length, 20);
  assert.match(reset.html, /Tìm thấy <strong>40<\/strong>/);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
});

test('Query sai kiểu/độ dài/ngành/lớp trả 400; không ghi dữ liệu hay thực thi HTML', async (t) => {
  const { base, filePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  const cases = [
    'q=a&q=b', 'q[x]=a', 'q[]=a', 'className=a&className=b', 'major=CNTT&major=VL',
    'major=__proto__', 'major=OTHER', 'className=NO-SUCH-CLASS', 'q=%00',
    new URLSearchParams({ q: 'a'.repeat(101) }).toString(),
    new URLSearchParams({ className: 'a'.repeat(31) }).toString(),
  ];
  for (const query of cases) {
    const response = await request(base, '/students?' + query);
    assert.equal(response.status, 400, query);
    assert.equal(await fs.readFile(filePath, 'utf8'), before);
  }
  const attack = await request(base, '/students?' + new URLSearchParams({ q: '<script>alert("xss")</script>' }));
  assert.equal(attack.status, 200);
  assert.match(attack.html, /&lt;script&gt;/);
  assert.doesNotMatch(attack.html, /<script>/);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
});

test('POST lớp ngoài danh mục hoặc sai ngành: 422, giữ select, không ghi; 24C11 hợp lệ', async (t) => {
  const { base, filePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  for (const input of [{ ...valid, className: 'NO-CLASS' }, { ...valid, className: '24C11', major: 'VL' }]) {
    const response = await request(base, '/students', { method: 'POST', body: new URLSearchParams(input).toString() });
    assert.equal(response.status, 422);
    assert.match(response.html, /id="className-error"/);
    assert.match(response.html, /Trang <strong>1<\/strong> \/ 2/);
    assert.equal(await fs.readFile(filePath, 'utf8'), before);
    if (input.className === '24C11') {
      assert.match(response.html, /value="24C11" selected/);
      assert.match(response.html, /value="VL" selected/);
    }
  }
  const post = await request(base, '/students', { method: 'POST', body: new URLSearchParams({ ...valid, className: '24C11' }).toString() });
  assert.equal(post.status, 303);
  assert.equal(JSON.parse(await fs.readFile(filePath, 'utf8')).at(-1).className, '24C11');
});

test('HTTP phân trang kho tạm 42 sinh viên: 20/20/2, đủ mã cũ, không ghi JSON', async (t) => {
  // Fixture độc lập với dữ liệu thật: npm test vẫn chạy khi người dùng đã thêm hồ sơ.
  const snapshot = [
    ...JSON.parse(await fs.readFile(seedPath, 'utf8')),
    { id: '2222', name: 'Sinh viên cũ', email: 'legacy-fixture@example.com', className: '24CNTT', major: 'CNTT' },
    { id: '02600011', name: 'Sinh viên demo', email: 'demo-fixture@example.com', className: '24C11', major: 'CNTT' },
  ];
  const original = JSON.stringify(snapshot, null, 2) + '\n';
  const { base, filePath } = await fixture(t);
  await fs.writeFile(filePath, original, 'utf8');
  const pages = [];
  for (const page of [1, 2, 3]) {
    const response = await request(base, `/students?page=${page}`);
    assert.equal(response.status, 200);
    pages.push(renderedIds(response.html));
    assert.match(response.html, new RegExp(`Trang <strong>${page}<\/strong> \/ 3`));
    assert.match(response.html, /Tìm thấy <strong>42<\/strong>/);
    if (page > 1) assert.match(response.html, new RegExp(`rel="prev" href="\/students\\?page=${page - 1}"`));
    if (page < 3) assert.match(response.html, new RegExp(`rel="next" href="\/students\\?page=${page + 1}"`));
  }
  assert.deepEqual(pages.map((page) => page.length), [20, 20, 2]);
  assert.deepEqual(pages.flat(), snapshot.map((item) => item.id));
  assert.equal(new Set(pages.flat()).size, 42);
  assert.equal(await fs.readFile(filePath, 'utf8'), original);
  const over = await request(base, '/students?page=99');
  assert.deepEqual(renderedIds(over.html), pages[2]);
});

test('HTTP Search + Filter + Pagination giữ query; form áp dụng mới không mang page cũ', async (t) => {
  const { base, filePath } = await fixture(t);
  const records = Array.from({ length: 42 }, (_, index) => ({
    id: String(index + 1).padStart(8, '0'), ...valid,
    name: 'Nguyễn An', email: `combined${index}@example.com`,
  }));
  await fs.writeFile(filePath, JSON.stringify(records), 'utf8');
  const before = await fs.readFile(filePath, 'utf8');
  const response = await request(base, '/students?q=NGUYEN&className=24CNTT1&major=CNTT&page=2');
  assert.equal(response.status, 200);
  assert.deepEqual(renderedIds(response.html), records.slice(20, 40).map((item) => item.id));
  assert.match(response.html, /rel="next" href="\/students\?q=NGUYEN&amp;className=24CNTT1&amp;major=CNTT&amp;page=3"/);
  assert.match(response.html, /rel="prev" href="\/students\?q=NGUYEN&amp;className=24CNTT1&amp;major=CNTT&amp;page=1"/);
  const searchForm = response.html.match(/<form class="search-form"[\s\S]*?<\/form>/)[0];
  assert.doesNotMatch(searchForm, /name="page"/);
  const first = await request(base, '/students?q=NGUYEN&className=24CNTT1&major=CNTT');
  assert.deepEqual(renderedIds(first.html), records.slice(0, 20).map((item) => item.id));
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
});

test('HTTP page bất thường trả 400; empty state và POST rỗng đều đủ locals', async (t) => {
  const { base, filePath } = await fixture(t);
  const before = await fs.readFile(filePath, 'utf8');
  for (const query of ['page=', 'page=0', 'page=-1', 'page=1.1', 'page=abc', 'page=1&page=2', 'page[x]=1', 'page[]=1', 'page=9007199254740992']) {
    const response = await request(base, '/students?' + query);
    assert.equal(response.status, 400, query);
    assert.doesNotMatch(response.html, /ReferenceError|undefined|<pre>/);
  }
  const blank = await request(base, '/students', { method: 'POST' });
  assert.equal(blank.status, 422);
  assert.equal((blank.html.match(/class="field-error"/g) || []).length, 4);
  assert.match(blank.html, /Trang <strong>1<\/strong> \/ 2/);
  assert.equal(await fs.readFile(filePath, 'utf8'), before);
  await fs.writeFile(filePath, '[]\n', 'utf8');
  const empty = await request(base, '/students?page=999');
  assert.equal(empty.status, 200);
  assert.match(empty.html, /Chưa có sinh viên/);
  assert.match(empty.html, /Trang <strong>1<\/strong> \/ 1/);
  assert.match(empty.html, /value="24C11"/);
});
