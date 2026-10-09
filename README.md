# Quản lý sinh viên — Express + EJS

Website học vụ dùng **Server-Side Rendering (SSR — kết xuất phía máy chủ)**: server đọc JSON, tìm/lọc, chia trang rồi EJS tạo HTML hoàn chỉnh. Website hoạt động đầy đủ khi tắt JavaScript trình duyệt.

## Công nghệ và phạm vi

Node.js là môi trường chạy JavaScript phía server; Express.js là web framework — khung phát triển web; EJS (Embedded JavaScript — JavaScript nhúng) là template engine — bộ máy xử lý mẫu HTML.

Giao diện dùng HTML (HyperText Markup Language — ngôn ngữ đánh dấu siêu văn bản) và CSS (Cascading Style Sheets — ngôn ngữ định dạng giao diện) thuần, responsive — thích ứng kích thước màn hình.

Chức năng:

- Danh sách năm trường và cột Thao tác, **20 sinh viên/trang**, nút Trước/Sau/chọn trang.
- Thêm sinh viên: nhập tên/email, chọn ngành/lớp có sẵn; server tự cấp MSSV.
- Tìm một phần tên/MSSV, không phân biệt hoa/thường và dấu tiếng Việt.
- Lọc lớp/ngành; kết hợp tìm kiếm và phân trang, giữ query khi chuyển trang.
- Validation — kiểm tra dữ liệu — phía server, email/MSSV duy nhất, giữ form khi lỗi.
- JSON lưu bền vững, seed chỉ lần đầu; chuyển hướng 303 sau khi lưu.
- Xóa sinh viên qua trang xác nhận EJS, nút Hủy không thay đổi dữ liệu.
- Bộ đếm MSSV bền vững: xóa mã lớn nhất không làm mã được cấp lại.

Không có CSR (Client-Side Rendering — kết xuất phía trình duyệt), SPA (Single-Page Application — ứng dụng một trang), AJAX (Asynchronous JavaScript and XML — trao đổi dữ liệu bất đồng bộ bằng JavaScript), Fetch API — giao diện lấy tài nguyên bằng JavaScript — database server hoặc ORM (Object-Relational Mapping — ánh xạ đối tượng và dữ liệu quan hệ). Không có sửa hồ sơ hoặc đăng nhập. Chỉ dùng localhost để demo, không public Internet.

## Cài đặt và chạy trên Windows

Yêu cầu Node.js >= 22 và npm (Node Package Manager — công cụ quản lý gói Node.js). Môi trường đã kiểm chứng: Node.js 24.18.0, npm 11.16.0, Express 5.2.1, EJS 3.1.10.

```powershell
cd D:\VSCode\HCMUS\Web\Block3
npm.cmd ci
npm.cmd run dev
```

Mở **http://127.0.0.1:3000/students**. Nếu server đã chạy, không mở thêm tiến trình. Dependency — thư viện phụ thuộc — của website chỉ có Express và EJS; không cần Chrome hoặc công cụ kiểm thử trình duyệt để chạy ứng dụng.

```powershell
npm.cmd start
npm.cmd test
```

- `dev`: dùng `node --watch server.js`, tự khởi động lại khi module backend thay đổi.
- `start`: chạy bình thường; sửa backend thì Ctrl+C trong đúng terminal rồi chạy lại.
- `test`: kiểm thử trên file JSON tạm; không thêm sinh viên thử vào dữ liệu thật.
- `test` cũng không xóa dữ liệu thật: mọi thử nghiệm thêm/xóa dùng kho tạm riêng.
- Dùng `npm.cmd` nếu PowerShell chặn `npm.ps1`.

Danh mục JSON được đọc khi khởi động. Sau khi chỉnh danh mục, hãy dừng đúng server và chạy lại; không dựa vào watcher để phát hiện mọi thay đổi JSON/template. Đừng mở nhiều tiến trình ghi chung một file. Server chỉ lắng nghe localhost; có thể đổi cổng bằng `$env:PORT = "3001"` trước khi chạy.

## Sử dụng và URL mẫu

**Tạo:** nhập họ tên/email, chọn ngành và lớp trong nhóm ngành tương ứng. Không có ô MSSV hoặc ô nhập lớp tự do. Các nhóm lớp hiển thị bằng HTML `optgroup`; tất cả lớp vẫn nhìn thấy, server kiểm tra quan hệ khi submit, không cần dropdown phụ thuộc bằng JavaScript.

**Tìm/lọc:** nhấn “Tìm kiếm / Áp dụng”; luôn về trang 1. “Xóa tìm kiếm” giữ lớp/ngành. “Đặt lại bộ lọc” bỏ toàn bộ điều kiện, về trang 1.

**Phân trang:** hiển thị số kết quả đã lọc, phạm vi đang xem và trang hiện tại/tổng trang. Nút Trước/Sau/chọn trang giữ `q`, `className`, `major`.

**Xóa:** nút “Xóa” trên từng hàng chỉ mở trang xác nhận bằng GET. Trang hiển thị đủ năm trường và cảnh báo không thể hoàn tác. “Hủy” về danh sách, không ghi. Chỉ “Xác nhận xóa” gửi POST mới xóa đúng MSSV được chọn; lưu xong mới redirect 303 về trang 1 và báo thành công. ID không tồn tại trả404, ID URL sai trả400.

Mở thử trang xác nhận an toàn: **http://127.0.0.1:3000/students/02600011/delete**, sau đó nhấn **Hủy**. Nếu xác nhận ở server này, dữ liệu thật sẽ bị xóa. Muốn demo đầy đủ thao tác xóa mà giữ 42 hồ sơ, sao chép dự án cùng toàn bộ dữ liệu/trạng thái cấp mã sang thư mục riêng, chạy cổng khác; không xóa thật rồi reset JSON để kiểm thử.

```text
/students
/students?page=1
/students?page=2
/students?page=3
/students?q=nguyen
/students?q=026000
/students?className=24C11
/students?major=CNTT
/students?q=nguyen&className=24CNTT1&major=CNTT&page=2
/students/02600011/delete
```

Ví dụ cuối chỉ có một kết quả trong dữ liệu thật nên page=2 an toàn về trang 1. Bộ kiểm thử dùng tập tạm có hơn 20 kết quả để chứng minh liên kết giữ đủ điều kiện. Với 42 sinh viên hiện tại: trang 1 có 20, trang 2 có 20, trang 3 có 2.

HTTP (Hypertext Transfer Protocol — giao thức truyền tải siêu văn bản) GET không ghi JSON. `page` bỏ qua nghĩa là 1; giá trị sai kiểu/0/âm/thập phân/lặp trả 400; vượt giới hạn về trang cuối. Danh sách rỗng hoặc không có kết quả hiển thị trang 1/1.

## Model, danh mục và cấp MSSV

Model — mô hình dữ liệu — có đúng năm trường:

| Trường | Quy tắc tạo mới |
|---|---|
| id | Server cấp chuỗi 8 chữ số, duy nhất; bảo toàn mã cũ |
| name | Bắt buộc, 1–100 ký tự Unicode, chuẩn hóa khoảng trắng |
| email | Bắt buộc, cú pháp email thông dụng, tối đa 254 ký tự; duy nhất không phân biệt hoa/thường |
| className | Mã lớp trong classes.json, tối đa 30 ký tự, thuộc ngành đã chọn |
| major | Mã ngành trong majors.json |

Unicode là chuẩn ký tự đa ngôn ngữ; NFC (Normalization Form C — dạng chuẩn hóa tổ hợp) hỗ trợ tên Việt có dấu. Email lưu tên miền chữ thường, so trùng trên toàn địa chỉ không phân biệt hoa/thường; không xác minh hộp thư hoặc giới hạn domain trường.

`data/majors.json` có CNTT, KHDL, TOAN, VL và tên ngành đầy đủ. `data/classes.json` có 10 cặp mã lớp/ngành, kế thừa toàn bộ dữ liệu đang dùng, gồm `24CNTT` và `24C11` thuộc CNTT. Dropdown được server render từ hai danh mục này, không khai báo lại danh sách trong template.

Bộ cấp MSSV dùng **high-water mark — MSSV lớn nhất từng được cấp/giữ chỗ** trong `data/students.id-state.json`. Lần triển khai đầu lấy max các mã thuần số hiện có, không đổi MSSV cũ. Mỗi lần thêm lấy max giữa bộ đếm và mã đang có, tăng1, bổ sung số0 thành8 chữ số, kiểm tra duy nhất. **Ghi bộ đếm trước, ghi sinh viên sau**: lỗi/ngắt tiến trình sau khi giữ chỗ chỉ bỏ qua mã, không rollback để dùng lại. Thêm/xóa đều dùng cùng hàng đợi tuần tự.

`data/students.id-state.json.initialized` là marker — dấu mốc khởi tạo — được ghi trước khi tạo bộ đếm. Nếu state hoặc marker bị mất/hỏng sau khởi tạo, server từ chối khởi động/thao tác ghi; không tự suy lại từ danh sách đã xóa. Khởi tạo bị ngắt giữa marker và state cũng dừng an toàn. Không tự xóa marker/state để “sửa lỗi”.

Giữ mã cũ `2222`, không lấp lỗ dưới high-water mark; mã có chữ/gạch nối không tham gia dãy tự động. Hết phạm vi99999999 hoặc max cũ vượt phạm vi thì trả409, không thêm hồ sơ. Client gửi trường `id` bị từ chối422. Xóa không giảm bộ đếm, kể cả xóa hết hồ sơ hoặc restart.

Mã lớn nhất đang có là `02600011`; mã tiếp theo dự kiến `02600012`. Đây là MSSV giả lập cho bài tập, không phải cơ chế cấp mã chính thức của trường.

## JSON, SSR và Post/Redirect/Get

JSON (JavaScript Object Notation — định dạng văn bản có cấu trúc) lưu UTF-8 (Unicode Transformation Format, 8-bit — mã hóa Unicode). Seed có40 sinh viên giả lập, email example.com; chỉ dùng trên kho mới chưa có sinh viên hoặc trạng thái khởi tạo. Không seed lại mảng rỗng/JSON hỏng. Nếu metadata đã có mà file sinh viên mất, dừng báo lỗi, không seed đè lịch sử.

Ghi file tạm cùng thư mục rồi rename — đổi tên thay thế — sau khi flush dữ liệu. Khi lỗi không xóa file chính. Hàng đợi lưu hoạt động trong một tiến trình Node.js.

PRG (Post/Redirect/Get — gửi POST, chuyển hướng, tải lại bằng GET):

```text
POST /students → validation → lưu JSON
→ HTTP 303 Location /students?created=MSSV_MOI&page=TRANG_CHUA_HO_SO
→ GET HTML 200
```

Refresh chỉ lặp GET, không thêm trùng. HTML response và View Source — xem mã nguồn trang — có ngay các hàng sinh viên; không tải JSON hoặc render phía client.

Luồng xóa: `GET /students/:id/delete` → trang xác nhận → `POST /students/:id/delete` → lưu JSON → `303 /students?deleted=1` → GET200. Refresh chỉ GET, không xóa thêm. Thông báo `deleted=1` là cờ giao diện, không phải bằng chứng độc lập đã xóa.

## Cấu trúc và trách nhiệm

```text
app.js / server.js                Cấu hình Express và khởi động
routes/students.js                GET/POST, renderPage chung, 303
validators/studentValidator.js   Validation input và tương thích bản ghi cũ
services/studentStore.js         JSON, bộ đếm, getById/remove/add, hàng đợi
services/studentCatalog.js       Đọc/kiểm tra danh mục độc lập
services/studentSearch.js        Query, tìm/lọc, phân trang và URL
views/students.ejs / error.ejs    HTML EJS có escape
views/delete-student.ejs         Trang xác nhận, form POST và Hủy
public/css/styles.css            Dashboard responsive, form và phân trang
data/majors.json                 Mã/tên bốn ngành
data/classes.json                Mười lớp và mã ngành tương ứng
data/students.seed.json          40 mẫu, không thay đổi
data/students.json               Dữ liệu thật, không reset
data/students.id-state.json      High-water mark bền vững
data/students.id-state.json.initialized  Dấu mốc đã khởi tạo
data/backups/                    Bản sao lưu trước khi bổ sung xóa
tests/*.test.js                  Sáu file kiểm thử
docs/TECHNICAL_REPORT.md         Giải thích để thuyết trình
docs/EVIDENCE.md                 Kết quả, bằng chứng và checklist
docs/evidence/delete/            HTML/header/log/ảnh phiên bản có xóa
```

`students.json`, state/marker và backups nằm trong .gitignore. Khi sao chép/nộp dự án có dữ liệu, **mang đủ file sinh viên + state + marker**, đừng chỉ dựa vào Git. Kho hoàn toàn mới sẽ seed40 mẫu; chuyển kho đã dùng mà thiếu metadata không được xem là quy trình hợp lệ.

Bản sao trước triển khai: `data/backups/students-before-delete-20261009-171809.json`, kèm `.id-state.json` và `.id-state.json.initialized`. Khi phục hồi phải dừng server và giữ bộ đếm ít nhất bằng mã lớn nhất đã từng reserve; **không phục hồi counter cũ thấp hơn lịch sử**. Không suy bộ đếm chỉ từ hồ sơ còn lại sau xóa. Nếu mất cả state và marker, không thể tự suy lịch sử từ danh sách; cần bản sao/trạng thái đáng tin cậy và xử lý thủ công.

## Kiểm chứng và giới hạn

**65/65 test tự động đạt; 10/10 nhóm Chrome phiên bản xóa đạt khi JavaScript tắt.** Kiểm tra desktop1440×1000 và mobile390×844. Có kiểm thử ngắt tiến trình thật sau reserve, xóa max/restart, thêm/xóa đồng thời, lỗi ghi và state/marker hỏng/mất. Dữ liệu thật vẫn **42 sinh viên**, MSSV `2222`/`02600011` nguyên vẹn; hash SHA-256 — dấu vân tay nội dung file — của JSON thật/seed và bộ đếm trước/sau kiểm thử không đổi.

[Kết quả test](docs/evidence/delete/test-output.txt), [Chrome](docs/evidence/delete/browser-results.json), [bảo toàn JSON](docs/evidence/delete/data-preservation.json), [server demo](docs/evidence/delete/live-results.json).

Ảnh/log trong `docs/evidence/final/`, `upgrade/` và thư mục evidence gốc là lịch sử các phiên bản trước khi có xóa. Bằng chứng mới nằm trong `delete/`. Mọi POST kiểm thử chỉ tác động bản sao tạm.

Giới hạn: một tiến trình ghi, chưa thử Firefox/Safari/thiết bị thật/trình đọc màn hình hoặc sự cố mất điện. Không chỉnh JSON/bộ đếm bằng tay khi server chạy. Website chưa có xác thực/phân quyền hoặc CSRF (Cross-Site Request Forgery — chống giả mạo yêu cầu từ website khác) chuyên biệt: **chỉ demo localhost, không public Internet**, không coi trang xác nhận là cơ chế bảo mật truy cập.

Xem [báo cáo kỹ thuật](docs/TECHNICAL_REPORT.md) và [bằng chứng nghiệm thu](docs/EVIDENCE.md).
