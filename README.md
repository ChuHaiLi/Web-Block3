# Quản lý sinh viên — Express + EJS

Website học vụ dùng **SSR (Server-Side Rendering — kết xuất phía máy chủ)**: Express đọc JSON, tìm/lọc, chia trang rồi EJS tạo HTML hoàn chỉnh. Website hoạt động khi tắt JavaScript trình duyệt.

## Công nghệ và chức năng

Node.js là môi trường chạy JavaScript phía server; Express.js là web framework — khung phát triển web; EJS (Embedded JavaScript — JavaScript nhúng) là template engine — bộ máy xử lý mẫu HTML. Giao diện dùng HTML (HyperText Markup Language — ngôn ngữ đánh dấu siêu văn bản) và CSS (Cascading Style Sheets — ngôn ngữ định dạng) thuần, responsive — thích ứng màn hình.

- Danh sách năm trường, cột Thao tác, tối đa20 sinh viên/trang.
- Bảng toàn chiều ngang, popup “+ Thêm sinh viên” không cần JavaScript.
- Form chỉ nhập **Họ tên, Email và chọn Lớp sinh hoạt**.
- Server suy ngành từ lớp, cấp MSSV đúng khóa tuyển sinh.
- Tìm theo tên/MSSV, không phân biệt hoa/thường và dấu tiếng Việt.
- Lọc lớp sinh hoạt/ngành, kết hợp tìm kiếm/phân trang và giữ query.
- Validation — kiểm tra dữ liệu — phía server; giữ form/lỗi khi nhập sai.
- Xóa qua trang xác nhận; bộ đếm bền vững không dùng lại MSSV đã xóa.
- JSON lưu UTF-8, POST thành công chuyển hướng303 sau khi lưu xong.

Không dùng CSR (Client-Side Rendering — kết xuất phía trình duyệt), SPA (Single-Page Application — ứng dụng một trang), AJAX (Asynchronous JavaScript and XML — trao đổi dữ liệu bất đồng bộ bằng JavaScript), Fetch API — giao diện lấy tài nguyên bằng JavaScript — database server hoặc ORM (Object-Relational Mapping — ánh xạ đối tượng và dữ liệu quan hệ). Không có đăng nhập/sửa hồ sơ; chỉ demo localhost.

## Cài đặt và chạy trên Windows

Yêu cầu Node.js>=22 và npm (Node Package Manager — công cụ quản lý gói). Môi trường đã kiểm chứng: Node24.18.0, npm11.16.0, Express5.2.1, EJS3.1.10.

```powershell
cd D:\VSCode\HCMUS\Web\Block3
npm.cmd ci
npm.cmd run dev
```

Mở **http://127.0.0.1:3000/students**. Nếu đã có server, không mở thêm tiến trình cùng ghi một bộ dữ liệu.

```powershell
npm.cmd start
npm.cmd test
```

`dev` dùng node --watch; `start` chạy bình thường; `test` dùng kho tạm, không thêm/xóa dữ liệu thật. Dùng npm.cmd nếu PowerShell chặn npm.ps1. Không thêm dependency — thư viện phụ thuộc — mới: website chỉ cần Express/EJS. Công cụ Chrome kiểm thử nằm ngoài dự án.

Sau khi sửa danh mục hoặc triển khai backend mới, dừng đúng terminal bằng Ctrl+C rồi chạy lại. Server chỉ lắng nghe127.0.0.1; có thể đổi cổng bằng `$env:PORT = "3001"`.

## Lớp sinh hoạt, ngành và model

**Lớp sinh hoạt (lớp hành chính)** là lớp quản lý hành chính của sinh viên. Một sinh viên thường thuộc một lớp sinh hoạt tại một thời điểm. Sinh viên có thể đăng ký nhiều **lớp học phần** của các môn khác nhau. Dự án này chỉ quản lý lớp sinh hoạt, **chưa quản lý đăng ký học phần**.

Model — mô hình dữ liệu — vẫn đúng năm thuộc tính:

| Trường | Nguồn/quy tắc |
|---|---|
| id | Server cấp chuỗi8 chữ số theo khóa, duy nhất |
| name | Người dùng nhập;1–100 ký tự Unicode, chuẩn hóa khoảng trắng |
| email | Người dùng nhập;<=254 ký tự, đúng cú pháp, duy nhất không phân biệt hoa/thường |
| className | Người dùng chọn mã lớp sinh hoạt có sẵn |
| major | Server lấy majorCode của lớp, không nhận từ client |

Unicode là chuẩn ký tự đa ngôn ngữ. NFC (Normalization Form C — dạng chuẩn hóa tổ hợp) giữ tên Việt có dấu. Email lưu tên miền chữ thường; không xác minh hộp thư hoặc giới hạn domain trường học.

`data/majors.json` lưu mã/tên ngành. Mỗi lớp trong `data/classes.json` có:

```json
{ "code": "24C11", "name": "24C11", "majorCode": "CNTT", "cohort": "24" }
```

code duy nhất, name là tên hiển thị, majorCode tham chiếu ngành có sẵn, cohort là hai chữ số khóa và phải khớp đầu mã lớp. Mười mã lớp/quan hệ ngành hiện có được giữ nguyên, chỉ bổ sung metadata — thông tin mô tả — tên/khóa. Dropdown có dạng “26TOAN1 — Toán học”, nhóm bằng optgroup. **Không đoán ngành từ chuỗi trong mã lớp**:24C11 suy CNTT nhờ majorCode.

POST chỉ nhận name/email/className. Gửi id hoặc major, kể cả đúng ngành/rỗng, bị từ chối422. Bộ lọc ngành qua GET vẫn giữ nguyên.

## Cấp MSSV theo khóa và bảo toàn lịch sử

MSSV có dạng **0YYNNNNN**: tiền tố0YY từ cohort, năm chữ số sau là thứ tự. Các lớp cùng khóa dùng chung counter — bộ đếm — không tách theo ngành/lớp.

State — trạng thái cấp mã — dùng cùng file `data/students.id-state.json`, phiên bản2:

```json
{
  "version": 2,
  "legacyHighWaterMark": "02600011",
  "counters": { "024": "10010", "025": "00010", "026": "00011" }
}
```

High-water mark — số thứ tự lớn nhất từng cấp/giữ chỗ — riêng cho từng tiền tố. Với trạng thái thật sau nâng cấp, mã tiếp theo dự kiến:

| Lớp ví dụ | Ngành tự gán | MSSV tiếp theo nếu chưa thêm hồ sơ cùng khóa |
|---|---|---|
|24CNTT1,24VL1 hoặc24C11 |CNTT/VL theo lớp |02410011 |
|25KHDL1 |KHDL |02500011 |
|26TOAN1 |TOAN |02600012 |

Đây là dự kiến, không phải mã được reserve — giữ chỗ — trước khi POST. Khóa24 dùng10011 vì đã có02410010 của sinh viên Vật lý; không lấp các khoảng trống nhỏ hơn max.

Thêm/xóa dùng cùng hàng đợi tuần tự: đọc mới nhất → validate/kiểm tra email → suy khóa/ngành → cấp mã → **ghi counter trước, ghi sinh viên sau**. Lỗi/ngắt sau reserve chỉ bỏ qua mã; không giảm counter. Xóa kể cả max/không còn hồ sơ không giảm lịch sử. Hết99999 ở một khóa trả409, không ảnh hưởng khóa khác. Khóa mới được quản lý theo cohort trong danh mục.

Migration — chuyển đổi trạng thái — giữ nguyên legacyHighWaterMark, đối chiếu max MSSV8 chữ số theo từng tiền tố và counter đã lưu, không giảm. Mã đã biết bị xóa02600011 được giữ trong quy tắc lịch sử tối thiểu:026 luôn ít nhất00011. Không đổi MSSV hoặc ngành của hồ sơ cũ; quy tắc mới chỉ áp dụng hồ sơ thêm sau nâng cấp.

Marker — dấu mốc — `students.id-state.json.initialized` lên version2 **sau khi statev2 ghi thành công**. Nó ngăn nạp lại statev1 và hạ lịch sử sau chuyển đổi. Nếu gián đoạn giữa statev2/marker1, khởi động có thể hoàn tất marker; thiếu/hỏng state hoặc marker thì dừng an toàn. **Mất cả hai trên kho có hồ sơ cũng bị từ chối**, không tự bootstrap — khởi tạo — lại. Kho hoàn toàn mới chưa có dữ liệu/metadata mới được seed40.

Giới hạn lịch sử: statev1 chỉ có một max toàn hệ thống, không lưu toàn bộ mã đã xóa theo từng khóa. Chuyển đổi bảo toàn dữ liệu còn lại, max cũ và mã đã biết02600011, **không thể khôi phục lịch sử chưa từng được lưu**. Nếu có lịch sử đáng tin cậy bổ sung, cần đối chiếu và nâng counter khi server dừng; không tự đoán hoặc hạ counter.

## Sử dụng và HTTP routes

HTTP (Hypertext Transfer Protocol — giao thức truyền tải siêu văn bản):

| Method/URL | Vai trò |
|---|---|
|GET /students |Danh sách/tìm/lọc/phân trang HTML200 |
|POST /students |Ba trường đầu vào; suy ngành/cấp mã/lưu;303 sau thành công |
|GET /students/:id/delete |Trang xác nhận, không ghi |
|POST /students/:id/delete |Xóa một hồ sơ,303 sau lưu |

**Tạo:** nhấn “+ Thêm sinh viên”, nhập tên/email, chọn lớp. MSSV/ngành tự xác định phía server. X/Hủy/Esc đóng popup; không dùng JavaScript. POST lỗi422 hoặc hết mã409 hiển thị form trực tiếp trên trang, giữ tên/email/lớp và focus — vị trí nhận bàn phím — vào trường lỗi. Sau303 form trở lại popup đóng.

Popup dùng HTML Popover API — cơ chế cửa sổ nổi tích hợp — với popover/popovertarget, dạng non-modal — không khóa tương tác/focus toàn trang. Trình duyệt không hỗ trợ có fallback — dự phòng — form trực tiếp; chưa thử trực tiếp trình duyệt cũ. Đã thử Chrome với JavaScript tắt.

**Tìm/lọc:** GET, áp dụng mới về trang1; xóa tìm kiếm giữ lớp/ngành; reset bỏ điều kiện. **Phân trang:**20/trang, giữ q/className/major. **Xóa:** nút đầu mở GET xác nhận; Hủy không ghi; chỉ form POST xác nhận mới xóa.

```text
/students
/students?page=2
/students?q=nguyen
/students?q=026000
/students?className=24C11
/students?major=CNTT
/students?q=nguyen&className=24CNTT1&major=CNTT&page=2
/students/02400001/delete
```

40 hồ sơ hiện có chia20/20; page vượt giới hạn về trang cuối, page sai trả400. Danh sách rỗng/không có kết quả có trạng thái riêng.

PRG (Post/Redirect/Get — gửi POST, chuyển hướng, tải lại bằng GET): POST hợp lệ → lưu →303 Location /students?created=MSSV&page=TRANG → GET200. Refresh chỉ GET, không thêm trùng. Xóa cũng303→GET, refresh không xóa tiếp. View Source — xem mã nguồn — có dữ liệu ngay trong HTML response, chứng minh SSR.

## Cấu trúc và an toàn dữ liệu

```text
app.js / server.js                Express, lỗi/header/log, khởi độnglocalhost
routes/students.js                GET/POST, renderPage chung,303
validators/studentValidator.js    Ba trường input, suy ngành, giữ đọc dữ liệu cũ
services/studentStore.js          JSON, migration/counters, add/remove tuần tự
services/studentCatalog.js        Kiểm tra danh mục ngành/lớp/khóa
services/studentSearch.js         Query, tìm/lọc/phân trang20, URL
views/students.ejs                Bảng, bộ lọc, pagination và thông báo
views/partials/student-form.ejs   Popup ba trường và form khi POST lỗi
views/delete-student.ejs          Xác nhậnxóa
public/css/styles.css             Giao diện responsive
data/classes.json / majors.json   Danh mục
data/students.json                40 hồ sơ được bảo toàn
data/students.seed.json           40 mẫu, không ghi lại
data/students.id-state.json       Bộ đếm từng khóa và max cũ
data/students.id-state.json.initialized  Dấu mốcversion2
data/backups/                     Sao lưu trước nângcấp
tests/*.test.js                   Bảy file/81 test
docs/evidence/cohort/             Bằng chứng hiện tại
```

JSON (JavaScript Object Notation — định dạng văn bản có cấu trúc) lưu UTF-8 (Unicode Transformation Format,8-bit — mã hóa Unicode). Ghi file tạm cùng thư mục với flush — đẩy dữ liệu ghi xuống lưu trữ — rồi rename; không xóa file chính trước. Hai file counter/sinh viên không có giao dịch nguyên tử chung, nhưng thứ tự ghi chống dùng lại mã sau lỗi/ngắt.

Sao lưu trước nâng cấp: `data/backups/before-cohort-20261009113740363/`, gồm sinh viên/state/marker/danh mục/seed. Không phục hồi counter cũ thấp hơn lịch sử từng khóa. Khi sao chép/nộp dự án, **mang đủ students + state + marker**, vì chúng thuộc .gitignore. Không chỉnh JSON bằng tay khi server chạy, không chạy hai server ghi chung một file.

## Kiểm chứng và giới hạn

**81/81 test tự động;9/9 nhóm Chrome đạt với JavaScript tắt**, desktop1440×1000/mobile390×844 và320×640. Giữ70 kịch bản hồi quy, cập nhật expectation — điều kiện mong đợi — theo chính sách mới; thêm11 test theo khóa/migration/lịch sử/khóa mới. Mọi POST kiểm thử dùng kho tạm.40 hồ sơ thật nguyên bytes; không có hồ sơ cũ lệch khóa/ngành.

[Tests](docs/evidence/cohort/test-output.txt), [Chrome](docs/evidence/cohort/browser-results.json), [dữ liệu](docs/evidence/cohort/data-preservation.json), [server demo](docs/evidence/cohort/live-results.json). State/marker/catalog được nâng cấp có chủ đích, không phải dữ liệu sinh viên bị đổi. Artifact — tệp kết quả — trong popup/delete/final/upgrade là lịch sử.

Giới hạn: một tiến trình ghi; chưa kiểm tra Firefox/Safari/thiết bị thật/trình đọc màn hình/mất điện. Lịch sử chưa lưu không thể suy đầy đủ; mã0YY chỉ mô phỏng khóa hai chữ số, không là chuẩn cấp MSSV chính thức. Chưa có xác thực/phân quyền hoặc CSRF (Cross-Site Request Forgery — chống giả mạo yêu cầu từ website khác) chuyên biệt: **không public Internet**.

Xem [báo cáo kỹ thuật](docs/TECHNICAL_REPORT.md) và [bằng chứng nghiệm thu](docs/EVIDENCE.md).
