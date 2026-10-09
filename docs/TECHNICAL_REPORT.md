# Báo cáo kỹ thuật — Student Management SSR

## 1. Stack và phạm vi

Node.js là môi trường chạy JavaScript phía máy chủ. Express.js là web framework — khung phát triển web — tổ chức HTTP route và middleware. EJS (Embedded JavaScript — JavaScript nhúng) là template engine — bộ máy xử lý mẫu. HTML (HyperText Markup Language — ngôn ngữ đánh dấu siêu văn bản) và CSS (Cascading Style Sheets — ngôn ngữ định dạng) tạo giao diện học vụ responsive — thích ứng màn hình.

**SSR (Server-Side Rendering — kết xuất phía máy chủ)**: Express đọc JSON, tính danh sách cần hiển thị rồi EJS tạo HTML hoàn chỉnh trước khi trả về. Trình duyệt nhận tên/MSSV trong response, không cần tải dữ liệu hay tạo bảng bằng JavaScript.

Không dùng CSR (Client-Side Rendering — kết xuất phía trình duyệt), SPA (Single-Page Application — ứng dụng một trang), AJAX (Asynchronous JavaScript and XML — trao đổi dữ liệu bất đồng bộ bằng JavaScript), Fetch API — giao diện lấy tài nguyên bằng JavaScript — database server hoặc ORM (Object-Relational Mapping — ánh xạ đối tượng và dữ liệu quan hệ).

Express và EJS vẫn là hai dependency — thư viện phụ thuộc — trực tiếp; không đổi package.json/package-lock.json. Công cụ Chrome chỉ phục vụ kiểm thử ngoài dự án.

## 2. Kiến trúc và trách nhiệm

| File | Vai trò |
|---|---|
| server.js | Khởi tạo kho dữ liệu, kiểm tra cổng và mở server localhost |
| app.js | Middleware — xử lý trung gian — parse form, CSS, header/log và lỗi |
| routes/students.js | Điều phối GET/POST, một hàm renderPage dùng chung |
| studentCatalog.js | Đọc hai JSON danh mục khi khởi động, kiểm tra tính nhất quán |
| studentValidator.js | Validation — kiểm tra tính hợp lệ — input và tương thích dữ liệu cũ |
| studentStore.js | Đọc/ghi JSON, hàng đợi chung thêm/xóa, bộ đếm MSSV bền vững |
| studentSearch.js | Kiểm tra query, tìm/lọc, chia trang và xây URL |
| students.ejs | Bảng, form, lỗi và phân trang HTML; không đọc JSON hoặc cấp mã |
| delete-student.ejs | Năm trường hồ sơ, cảnh báo và form xác nhận xóa bằng POST |

```text
GET /students?q=...&className=...&major=...&page=...
  → đọc toàn bộ JSON
  → kiểm tra query
  → tìm/lọc toàn bộ
  → đếm kết quả, tính tổng trang, slice tối đa 20
  → EJS render HTML 200

POST /students
  → parse bốn trường form, validation danh mục
  → hàng đợi: đọc mới nhất → email trùng → reserve mã vào state → thêm → ghi
  → tìm trang chứa hồ sơ đã lưu
  → 303 Location
  → GET render HTML

GET /students/:id/delete → kiểm tra ID → đọc hồ sơ → EJS xác nhận200 hoặc404
POST /students/:id/delete → cùng hàng đợi thêm/xóa → kiểm tra state/hồ sơ
  → ghi JSON bỏ đúng một MSSV → 303 /students?deleted=1 → GET trang1
```

Cùng renderPage truyền đầy đủ students, totalCount, resultCount, classes, filters, hasFilters, clearSearchUrl, pagination, values, errors, createdId, success, majors, catalogClasses và deleted cho cả GET lẫn POST có lỗi. Trang xác nhận dùng locals riêng student/majors. Không chữa lỗi thiếu locals — biến truyền vào template — bằng cách giấu thông tin hoặc bỏ validation.

## 3. Model và dữ liệu hiện có

Model — mô hình dữ liệu — đúng năm trường. ID (identifier — định danh) ở bài tập này chính là MSSV, không tách studentCode.

| Trường | Kiểu | Quy tắc tạo mới |
|---|---|---|
| id | string | Server cấp 8 chữ số, duy nhất, giữ số 0 đầu |
| name | string | Bắt buộc, 1–100 ký tự Unicode; NFC và gộp khoảng trắng |
| email | string | Cú pháp thông dụng, <=254 ký tự; duy nhất không phân biệt hoa/thường |
| className | string | Mã lớp <=30 ký tự trong classes.json, thuộc major |
| major | string | Mã ngành <=10 ký tự trong majors.json |

Unicode là chuẩn ký tự đa ngôn ngữ. NFC (Normalization Form C — dạng chuẩn hóa tổ hợp) giữ tên Việt có dấu. Không dùng biểu thức tên quá hạn chế, chấp nhận dấu nháy/gạch nối và escape khi hiển thị.

Có **42 sinh viên**: 40 mẫu, bản ghi mã cũ `2222`/lớp `24CNTT` và bản ghi demo `02600011`/lớp `24C11`. Cả hai lớp thuộc CNTT. Đối chiếu hash xác nhận không thay đổi bất kỳ byte nào của file thật trong lần hoàn thiện này.

Validator đọc giữ chính sách MSSV cũ 4–20 ký tự Latin/số/gạch nối. Store dùng giá trị chuẩn hóa để kiểm tra trùng nhưng giữ nguyên tất cả giá trị bản ghi đã có khi đọc/ghi lại. Validation tạo mới kiểm tra danh mục nghiêm ngặt, không đổi chính sách đọc cũ để làm dữ liệu hợp lệ trước đây bị mất.

## 4. Danh mục Class/Major độc lập

`data/majors.json`: mảng các đối tượng `{code, name}`, bốn ngành CNTT/KHDL/TOAN/VL.

`data/classes.json`: mảng các đối tượng `{code, major}`, mười lớp kế thừa từ dữ liệu:

| Ngành | Lớp |
|---|---|
| CNTT — Công nghệ thông tin | 24C11, 24CNTT, 24CNTT1, 24CNTT2 |
| KHDL — Khoa học dữ liệu | 25KHDL1, 25KHDL2 |
| TOAN — Toán học | 26TOAN1, 26TOAN2 |
| VL — Vật lý | 24VL1, 24VL2 |

Loader đọc UTF-8 một lần khi module khởi động, kiểm tra mảng không rỗng, đúng trường, kiểu/độ dài, mã trùng và major tham chiếu tồn tại. Danh mục trả về được đóng băng để không sửa vô tình trong bộ nhớ. JSON danh mục hỏng làm khởi động báo lỗi, không tự tạo danh mục khác hoặc ghi đè sinh viên. Sau khi sửa danh mục cần restart đúng server.

Các select của form tạo và tìm/lọc đều server render từ danh mục. Form tạo chỉ hai input name/email, hai select major/className. Select lớp chia nhóm bằng optgroup tên ngành. Không tự cập nhật dropdown lớp khi đổi ngành; người dùng chọn trong nhóm đúng và server kiểm tra khi POST. Đây là chủ đích để giữ HTML SSR không có JavaScript.

Lớp/ngành đều phải có sẵn; lớp hợp lệ nhưng chọn ngành khác cũng lỗi 422 tại className. Ngành không hợp lệ lỗi tại major. Select hợp lệ đã chọn được giữ sau lỗi. Giá trị tùy ý không được thêm làm option có thể chọn.

## 5. Validation và an toàn dữ liệu đầu vào

Không tin req.body hoặc req.query; mỗi trường phải là một chuỗi, không mảng/đối tượng, không ký tự điều khiển, có giới hạn độ dài. Bốn trường POST đều bắt buộc. Trường id do client gửi bị từ chối kể cả rỗng/sai kiểu/lặp; trường khác không được lưu vào model.

Tên chuẩn hóa Unicode và khoảng trắng; email giữ phần trước @, chuẩn hóa tên miền chữ thường khi lưu. So trùng trên toàn địa chỉ đã trim không phân biệt hoa/thường. Email dùng chính sách ASCII (American Standard Code for Information Interchange — bộ mã ký tự cơ bản) thông dụng, kiểm tra cấu trúc phần tên/domain; không giới hạn trường học, không hỗ trợ mọi địa chỉ quốc tế hóa hoặc xác minh hộp thư.

EJS `<%=` escape — chuyển ký tự HTML đặc biệt thành văn bản — trên bảng, form, filter và href. Không xuất thô dữ liệu người dùng. XSS (Cross-Site Scripting — tấn công chèn mã vào trang) được kiểm thử trên tên lưu trữ, form lỗi và query.

CSP (Content Security Policy — chính sách bảo mật nội dung) chặn script, giới hạn nguồn CSS/form, chặn nhúng trang. Form chỉ nhận application/x-www-form-urlencoded, body tối đa 16 KB/20 tham số; sai Content-Type 415, quá lớn 413. Log không ghi body/email/query người dùng.

## 6. Tự động cấp MSSV và JSON

JSON (JavaScript Object Notation — định dạng văn bản có cấu trúc) dùng UTF-8 (Unicode Transformation Format, 8-bit — mã hóa Unicode). Chỉ seed 40 bản ghi nếu file chính chưa tồn tại; không seed lại mảng rỗng, JSON hỏng, model sai hoặc file mất lúc đang chạy.

Cấp MSSV dùng high-water mark — mã số lớn nhất từng được cấp/giữ chỗ — trong `data/students.id-state.json`, ví dụ:

```json
{ "version": 1, "highWaterMark": "02600011" }
```

State lưu chuỗi, tính toán bằng BigInt — kiểu số nguyên chính xác với giá trị lớn — để xử lý cả mã số cũ dài hơn8 chữ số mà không mất độ chính xác. Mã mới vẫn chỉ8 chữ số; max chạm/vượt99999999 thì từ chối thêm409.

Cấp MSSV nằm trong cùng hàng đợi Promise — đối tượng kết quả bất đồng bộ — với xóa:

1. Validate bốn trường, kiểm tra cặp lớp/ngành.
2. Đọc danh sách mới nhất và kiểm tra email trùng.
3. Đọc state hợp lệ; lấy max giữa high-water mark và MSSV thuần số hiện có, chỉ tăng nếu cần.
4. Cộng 1, pad — thêm số 0 đầu — đến 8 chữ số.
5. Kiểm tra ứng viên duy nhất; reserve — giữ chỗ — bằng cách ghi state nguyên tử trước.
6. Sau đó ghi bản ghi đúng năm trường vào students.json; chỉ trả kết quả khi ghi xong.

Ví dụ: max hiện tại `02600011` → dự kiến `02600012`. Không dùng số lượng bản ghi để cấp mã, không lấp khoảng trống dưới max. Mã có chữ/gạch nối giữ nguyên và không tham gia max số. Nếu không có mã số, bắt đầu 00000001. Chạm/vượt 99999999 thì lỗi 409, không tạo mã chín chữ số hoặc quay lại đầu.

Hai POST gần nhau được tuần tự hóa cả đọc/kiểm tra/reserve/thêm/ghi, không đọc chung max cũ hoặc mất bản ghi. Xóa cũng nằm trong hàng đợi này. Xóa không giảm high-water mark, kể cả xóa mã lớn nhất hoặc toàn bộ danh sách. Hàng đợi tiếp tục sau một thao tác lỗi.

Thứ tự ghi hai file không tạo giao dịch nguyên tử chung, nhưng bảo vệ không dùng lại mã:

| Điểm lỗi/ngắt | Kết quả an toàn |
|---|---|
| Trước state được ghi thành công | Không ghi sinh viên, chưa có mã reserve bền vững |
| Sau state, trước/giữa ghi sinh viên | Counter đã tăng; bản ghi có thể chưa có, mã bị bỏ qua |
| Sau JSON sinh viên, trước303 | Sinh viên đã có, counter đã tăng; không dùng lại mã |
| Khi ghi JSON xóa thất bại | File cũ còn, không trả303/không báo xóa thành công |

Không rollback — đưa về trạng thái trước — bộ đếm sau lỗi ghi sinh viên. Restart đọc bộ đếm đã lưu, không suy lại chỉ từ danh sách. Process crash — tiến trình bị ngắt — sau reserve được kiểm thử bằng tiến trình Node thật; đây không phải kiểm chứng mất điện vật lý.

### Khởi tạo và phát hiện state bị mất

Lần đầu nâng cấp, khi chưa có state/marker, kiểm tra dữ liệu hiện có rồi tạo `data/students.id-state.json.initialized` với `{ "version": 1 }` trước, dùng cờ tạo mới độc quyền và flush; sau đó ghi state từ max hiện tại. Không đổi student record.

Marker — dấu mốc đã khởi tạo — tồn tại bền vững qua restart. Nếu thiếu/hỏng state hoặc marker sau khởi tạo, initialize/add/remove từ chối; không tự tạo lại mã từ danh sách đã bị xóa. Ngắt bootstrap — khởi tạo đầu tiên — giữa marker và state cũng fail closed — dừng an toàn — để không đoán sai lịch sử. File sinh viên bị mất khi metadata còn cũng không được seed lại. GET xác nhận chỉ đọc hồ sơ, không cập nhật counter.

Sao lưu/di chuyển phải mang đủ students.json, state và marker. Phục hồi thủ công không được giảm counter dưới mã lớn nhất từng reserve; bản sao counter cũ có thể không đủ để phục hồi lịch sử. Mất đồng thời cả state và marker không thể phân biệt chắc chắn với dữ liệu legacy chưa nâng cấp: không xóa cả hai, cần backup đáng tin cậy và xử lý thủ công; chương trình không thể khôi phục lịch sử đã mất bằng suy đoán.

Ghi file tạm cùng thư mục với tạo mới độc quyền và flush — đẩy nội dung ghi xuống lưu trữ — rồi rename; không xóa file chính trước. Lỗi ghi/rename giữ file chính và dọn file tạm của thao tác. Không tuyên bố chống mọi sự cố mất điện. Chỉ một tiến trình/store ghi chung một file; rename không thay thế khóa nhiều tiến trình.

## 7. Tìm kiếm và lọc bằng GET

HTTP là Hypertext Transfer Protocol — giao thức truyền tải siêu văn bản. Query là tham số URL.

| Query | Chính sách |
|---|---|
| q | Chuỗi <=100 ký tự, trim/NFC; rỗng bỏ điều kiện tìm |
| className | Rỗng hoặc mã lớp trong JSON danh mục, <=30 ký tự |
| major | Rỗng hoặc mã ngành hợp lệ, <=10 ký tự |
| page | Bỏ qua là 1; một chuỗi số nguyên dương an toàn, không số 0 đầu |

Query lặp, bracket dạng page[x]/q[], sai kiểu, ký tự điều khiển hoặc quá dài trả HTML 400. Không bỏ qua input bất thường rồi coi là danh sách đầy đủ.

Tìm kiếm dùng Unicode NFD (Normalization Form D — dạng tách dấu), bỏ dấu kết hợp, đổi đ/Đ thành d, chữ thường và gộp khoảng trắng. Chỉ chuẩn hóa bản sao khi so sánh, không sửa tên/MSSV trong JSON.

```text
(q rỗng OR tên chứa q OR MSSV chứa q)
AND (className rỗng OR lớp trùng)
AND (major rỗng OR ngành trùng)
```

OR là hoặc; AND là và. Bộ lọc lớp/ngành so chính xác. Không tìm theo email. Các danh mục select không bị thu hẹp theo tập kết quả.

Form GET giữ điều kiện đã nhập/chọn. Xóa q giữ lớp/ngành nhưng không giữ page; reset về /students. Lớp và ngành không cùng quan hệ trong form lọc vẫn là hai điều kiện AND hợp lệ và có thể không có kết quả, khác validation form tạo.

## 8. Phân trang phía server

PAGE_SIZE = 20. Trình tự bắt buộc: đọc toàn bộ → tìm/lọc → resultCount → totalPages → giới hạn page → slice.

```text
totalPages = max(1, ceil(resultCount / 20))
page = min(requestedPage, totalPages)
offset = (page - 1) * 20
students = matches.slice(offset, offset + 20)
```

Giữ thứ tự mảng JSON, không sort ngẫu nhiên. Với một tập không thay đổi, các slice liên tiếp không bỏ sót/lặp bản ghi. totalCount là tổng kho, resultCount là số sau lọc, students.length là số trên trang. Giao diện không lấy students.length làm tổng kết quả.

42 bản ghi → 20/20/2, phạm vi 1–20, 21–40, 41–42. Bộ lọc có 7 kết quả → một trang 7 dòng. Tổng hoặc kết quả rỗng → trang 1/1, start/end = 0, không có Previous/Next link.

page sai (0, âm, thập phân, chữ, khoảng trắng, số không an toàn, nhiều giá trị) trả 400. Số hợp lệ vượt trang cuối được clamp — giới hạn — về trang cuối, HTML hiển thị đúng trang thực tế; không ghi JSON.

URLSearchParams xây liên kết đã encode, giữ q/className/major và thêm page. Nút trang render cửa sổ tối đa bảy số với dấu … nếu cần, không tạo hàng trăm nút. Trang hiện tại có aria-current=page; Trước/Sau vô hiệu là span, không là link lỗi.

Form tìm/lọc không có trường page, vì vậy áp dụng điều kiện mới luôn bắt đầu trang 1. Ví dụ q=nguyen&className=24CNTT1&major=CNTT&page=2 chỉ tới trang 2 khi thật sự đủ kết quả.

## 9. PRG, route và lỗi

PRG (Post/Redirect/Get — gửi POST, chuyển hướng, tải lại bằng GET) dùng HTTP 303 See Other — xem tài nguyên khác.

Sau lưu, route đọc danh sách và tìm vị trí hồ sơ vừa thêm để redirect đến đúng trang. Ví dụ kiểm thử bản sao dữ liệu:

```text
POST /students → JSON từ 42 thành 43
303 Location: /students?created=02600012&page=3
GET đích → 200, trang 3 có hồ sơ mới
Refresh → GET, vẫn 43 bản ghi
```

| Request/tình huống | Response |
|---|---|
| GET danh sách/tìm/lọc/phân trang hợp lệ | 200, HTML chứa các hàng |
| GET /students/:id/delete hợp lệ | 200, trang xác nhận; không ghi |
| POST /students/:id/delete lưu thành công | 303 /students?deleted=1 rồi GET200 |
| Xóa: ID không tồn tại / ID URL sai | 404 / 400, không ghi |
| Query không hợp lệ | 400, HTML lỗi |
| POST thiếu/sai dữ liệu, lớp/ngành sai, email trùng, client gửi id | 422, giữ form và lỗi cụ thể |
| Hết phạm vi MSSV | 409, giữ form, không ghi |
| POST lưu thành công | 303 rồi GET 200 |
| Body lớn / Content-Type sai | 413 / 415 |
| JSON hỏng hoặc lỗi đọc/ghi | 500, thông báo an toàn, không lộ stack trace |
| URL không có | 404 |

created là cờ giao diện, chỉ hiển thị mã 8 chữ số thực sự tồn tại; không phải bằng chứng độc lập một giao dịch. Thông báo có thể còn khi refresh URL thành công.

### Xóa sinh viên bằng SSR

Nút Xóa là liên kết GET tới `/students/:id/delete`, xuất hiện trên mọi hàng đã render kể cả khi tìm/lọc/phân trang. GET kiểm tra ID Latin/số/gạch nối4–20 ký tự, tìm theo mã chuẩn hóa để tương thích legacy, render đúng năm trường và cảnh báo “Bạn có chắc chắn muốn xóa sinh viên này? Hành động này không thể hoàn tác.” GET không thay đổi JSON/state; Hủy là liên kết GET về danh sách.

POST cùng URL gọi store.remove: đọc danh sách mới nhất, tìm đúng một mã URL, kiểm tra trạng thái cấp mã, giữ high-water mark, ghi mảng bỏ đúng một vị trí đã tìm. Index chỉ là vị trí tìm được trong dữ liệu server, không nhận index hoặc ID khác từ body/bảng. ID không tồn tại404, URL sai400; body gửi thêm ID không gây xóa nhiều bản ghi.

Sau lưu trả303 `/students?deleted=1`, GET render trang1 với tổng/phân trang tính lại. Refresh không xóa thêm; POST lặp cùng mã đã xóa404. Truy cập page cũ vượt giới hạn được giới hạn về trang cuối như trước. deleted là cờ thông báo, không phải bằng chứng một giao dịch. Tên/email/lớp/ngành trong trang xác nhận và aria-label nút được EJS escape; đường dẫn file luôn là cấu hình cố định, không ghép ID URL vào đường dẫn file.

Không dùng method-override, confirm(), modal hoặc JavaScript client. Trang xác nhận ngăn thao tác vô ý nhưng **không phải xác thực hoặc phân quyền**. Website chỉ demo localhost, không public Internet.

## 10. Giao diện, kiểm thử và vận hành

Dashboard học vụ giữ bảng rộng bên trái/form bên phải, xếp dọc trên mobile. Search/Filter và Pagination cùng màu, khoảng cách, focus. Bảng cuộn ngang riêng, không làm tràn trang. Label, heading, caption, skip link — liên kết bỏ qua tới nội dung chính — và thông báo lỗi hỗ trợ accessibility — khả năng tiếp cận. Chưa chứng nhận toàn diện theo chuẩn tiếp cận hoặc trình đọc màn hình.

**65 test tự động đạt, 0 lỗi/bỏ qua; 10 nhóm Chrome phiên bản xóa đạt khi JavaScript tắt**. Giữ49 test trước, điều chỉnh assertion cột thao tác/metadata và khởi tạo state; bổ sung16 test xác nhận/xóa/không dùng lại mã/ghi lỗi/crash/restart. Test dùng kho tạm. Chrome dùng bản sao42: xóa02600011 thành41, thêm02600012 thành42, thêm mẫu escape thành43; file thật vẫn42, seed40 và counter02600011 không đổi. Bằng chứng mới tại `docs/evidence/delete/`; `final/` và `upgrade/` là lịch sử.

Lỗi 500 lịch sử do Node giữ route cũ, template mới đòi totalCount. Phòng lặp lại: renderPage chung cung cấp đủ biến, test GET/POST lỗi/empty/query/page, dùng dev khi sửa và restart đúng server nếu chạy start. Không kill tiến trình ngoài project, không reset JSON để chữa lỗi template.

Giới hạn: một tiến trình ghi, chưa thử Firefox/Safari/thiết bị vật lý/trình đọc màn hình/mất điện. Không can thiệp trực tiếp hoặc phục hồi counter cũ thấp hơn lịch sử. Không có xác thực/phân quyền hoặc cơ chế CSRF (Cross-Site Request Forgery — chống giả mạo yêu cầu từ website khác) chuyên biệt. Chỉ phục vụ học tập localhost; không coi chức năng xóa là an toàn để public Internet.

Xem [EVIDENCE.md](EVIDENCE.md) để đối chiếu từng yêu cầu và artifact thực tế.
