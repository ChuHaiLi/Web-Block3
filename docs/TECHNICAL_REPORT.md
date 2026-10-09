# Báo cáo kỹ thuật — Student Management SSR

## 1. Công nghệ, SSR và kiến trúc

Node.js là môi trường chạy JavaScript phía máy chủ. Express.js là web framework — khung phát triển web — tổ chức HTTP (Hypertext Transfer Protocol — giao thức truyền tải siêu văn bản) routes/middleware. EJS (Embedded JavaScript — JavaScript nhúng) là template engine — bộ máy xử lý mẫu. HTML (HyperText Markup Language — ngôn ngữ đánh dấu siêu văn bản)/CSS (Cascading Style Sheets — ngôn ngữ định dạng) thuần tạo giao diện học vụ responsive — thích ứng màn hình.

**SSR (Server-Side Rendering — kết xuất phía máy chủ)**: server đọc JSON, tìm/lọc/chia trang rồi EJS tạo HTML trước khi trả response. View Source có MSSV/tên/ngành; không cần JavaScript để tải dữ liệu hoặc tạo bảng. Popup chỉ mở/đóng phần HTML đã có, không phải CSR (Client-Side Rendering — kết xuất phía trình duyệt).

Không dùng AJAX (Asynchronous JavaScript and XML — trao đổi bất đồng bộ bằng JavaScript), Fetch API — giao diện lấy tài nguyên bằng JavaScript — SPA (Single-Page Application — ứng dụng một trang), database server hoặc ORM (Object-Relational Mapping — ánh xạ đối tượng-dữ liệu quan hệ). Express/EJS vẫn là hai dependency — thư viện phụ thuộc — trực tiếp; không thêm thư viện.

| File | Trách nhiệm |
|---|---|
|server.js |Khởi tạo/migrate kho trước khi mở localhost |
|app.js |Middleware — xử lý trung gian — parse form, CSS, header/log/lỗi |
|routes/students.js |GET/POST, renderPage chung và303 |
|services/studentCatalog.js |Đọc/kiểm tra JSON ngành/lớp/khóa |
|validators/studentValidator.js |Tên/email/lớp đầu vào, suy ngành; đọc legacy |
|services/studentStore.js |Hàng đợi JSON, counter theo khóa, migration, add/remove/getById |
|services/studentSearch.js |Query, tìm/lọc/phân trang20, tạo URL |
|views/students.ejs |Bảng/bộ lọc/phân trang/thông báo |
|views/partials/student-form.ejs |Popup ba trường và fallback POST lỗi |
|views/delete-student.ejs |Xác nhậnxóa, năm trường và formPOST |

## 2. Model và lớp sinh hoạt

Model — mô hình dữ liệu — vẫn đúng năm thuộc tính, không thêm cohort/studentCode vào hồ sơ:

| Trường | Kiểu | Nguồn/quy tắc tạo mới |
|---|---|---|
|id |string |Server cấp0YYNNNNN,8 chữ số duy nhất |
|name |string |Người dùng;1–100 ký tự Unicode/NFC, gộp khoảng trắng |
|email |string |Người dùng;<=254 ký tự, cú pháp thông dụng, duy nhất không phân biệt hoa/thường |
|className |string |Người dùng chọn mã lớp sinh hoạt<=30 ký tự có sẵn |
|major |string |Server lấy majorCode trong danh mục lớp |

ID (identifier — định danh) ở đây chính là MSSV. Unicode là chuẩn ký tự đa ngôn ngữ; NFC (Normalization Form C — dạng chuẩn hóa tổ hợp) giữ tên Việt có dấu. Không hạn chế tên bằng regex — biểu thức chính quy — quá chặt.

**Lớp sinh hoạt (lớp hành chính)** là lớp quản lý hành chính của sinh viên; một sinh viên thường thuộc một lớp tại một thời điểm. Sinh viên có thể đăng ký nhiều **lớp học phần** của các môn khác nhau. Dự án chỉ quản lý lớp sinh hoạt, **chưa quản lý đăng ký học phần**. Giữ nguyên thuộc tính/query className.

## 3. Danh mục và suy ngành/khóa

data/majors.json là mảng{code,name}. data/classes.json là mảng các lớp:

```json
{ "code": "24C11", "name": "24C11", "majorCode": "CNTT", "cohort": "24" }
```

code là mã duy nhất; name là tên hiển thị; majorCode phải thuộc majors.json; cohort là chuỗi hai chữ số, khớp hai ký tự đầu code. Loader đọc UTF-8 một lần khi khởi động, kiểm tra đúng bốn trường, độ dài/kiểu, ký tự điều khiển, mã trùng, ngành/khóa hợp lệ và đóng băng kết quả. Lỗi danh mục làm startup dừng rõ ràng, không tự sửa sinh viên. Thay đổi danh mục cần restart đúng server.

| Ngành | Các lớp sinh hoạt | Khóa/prefix |
|---|---|---|
|CNTT — Công nghệ thông tin |24C11,24CNTT,24CNTT1,24CNTT2 |24/024 |
|KHDL — Khoa học dữ liệu |25KHDL1,25KHDL2 |25/025 |
|TOAN — Toán học |26TOAN1,26TOAN2 |26/026 |
|VL — Vật lý |24VL1,24VL2 |24/024 |

Lookup — tìm bản ghi danh mục — bằng code đã chuẩn hóa:
selectedClass = CATALOG.classes.find(item.code === values.className).
major = selectedClass.majorCode, prefix = "0" + selectedClass.cohort.
**Không dò tên ngành trong chuỗi mã lớp**;24C11 vẫn gán đúng CNTT. code thiếu/ngành tham chiếu sai/khóa sai bị từ chối.

Form chỉ có name/email/className. Dropdown server render “mã/tên lớp — tên ngành”, optgroup theo ngành. Không có select major hoặc hidden major; bộ lọc GET theo ngành vẫn còn.

## 4. Validation và an toàn đầu vào

POST chỉ validate ba trường người dùng. Mỗi trường là một chuỗi, không mảng/đối tượng, không ký tự điều khiển, giới hạn độ dài. Class phải có trong JSON. Ngành suy từ lớp; client gửi **id hoặc major đều422**, kể cả giá trị đúng/rỗng/lặp. Store tự validate lại input client trong hàng đợi, không nhận major đã suy qua interface — giao diện gọi — đầu vào.

Tên chuẩn hóa NFC/trim/gộp khoảng trắng. Email dùng cú pháp ASCII (American Standard Code for Information Interchange — bộ mã ký tự cơ bản) thông dụng, giữ phần trước@, tên miền chữ thường. So trùng trên toàn email trim không phân biệt hoa/thường; không giới hạn trường học/xác minh hộp thư/hỗ trợ mọi email quốc tế.

Validation đọc dữ liệu cũ vẫn chấp nhận MSSV4–20 ký tự Latin/số/gạch nối và ngành hợp lệ; không áp quy tắc cohort/quan hệ mới để sửa hoặc từ chối hồ sơ cũ vốn hợp lệ. checkRecords giữ nguyên giá trị hồ sơ khi đọc/ghi lại, chỉ kiểm tra model/trùng.

EJS `<%=` escape — chuyển ký tự HTML nguy hiểm thành văn bản — trên bảng/form/filter/xác nhận. XSS (Cross-Site Scripting — chèn mã vào trang) được kiểm thử. CSP (Content Security Policy — chính sách bảo mật nội dung) chặn script; form chỉ application/x-www-form-urlencoded,16KB/20 tham số; sai Content-Type415/body lớn413. Log không ghi body/email/query.

## 5. Counter theo khóa, migration và lịch sử

High-water mark — số thứ tự lớn nhất từng cấp/giữ chỗ — riêng mỗi prefix, cùng file students.id-state.json:

```json
{
  "version": 2,
  "legacyHighWaterMark": "02600011",
  "counters": { "024": "10010", "025": "00010", "026": "00011" }
}
```

Các sequence là string đúng5 chữ số, prefix đúng0YY. Number đủ chính xác cho0–99999. MSSV mới luôn prefix + String(sequence+1).padStart(5,"0"), string8 chữ số. Không dùng max toàn hệ thống+1.

Khởi tạo/chuyển đổi chạy trong hàng đợi trước listen:

1. Đọc/kiểm tra students,state,marker; hồ sơ có sẵn mà thiếu cả state/marker thì dừng, không tự bootstrap — khởi tạo — lại.
2. Nếu statev1/marker1 hợp lệ, giữ nguyên highWaterMark trong legacyHighWaterMark.
3. Tạo các counter theo cohort danh mục; đối chiếu max suffix các MSSV8 chữ số0YY hiện có, counter đã lưu và max cũ nếu ánh xạ đúng0YYNNNNN.
4. Bảo toàn mã đã biết02600011 trong KNOWN_RESERVED_IDS:026 ít nhất00011 ngay cả khi statecũ chưa ghi mã này.
5. Ghi statev2 an toàn; **sau đó** marker lên{version:2}. Không ghi lại students.json.
6. Restart đọc v2; không giảm counter. Statev2/marker1 có thể hoàn tất bước marker sau gián đoạn; marker2 với statev1 bị từ chối để tránh hạ lịch sử.

State thiếu/hỏng/sai schema, marker thiếu/hỏng, file sinh viên mất khi metadata còn đều dừng an toàn. Runtime không migrate statev1; chỉ initialize hợp lệ được chuyển. Mất cả state/marker trên kho có hồ sơ bị từ chối. Kho hoàn toàn mới không có dữ liệu/metadata được seed40 và ghi marker1 trước state2 rồi marker2; ngắt trước state thì fail closed — dừng an toàn.

legacyHighWaterMark không bị thay bằng một max nhỏ hơn, counters chỉ tăng. MSSV cũ không đúng0YYNNNNN được giữ nguyên, không pad hoặc đổi mã; max cũ không ánh xạ được vẫn giữ literal — giá trị chuỗi nguyên gốc — chứ không giả lập lịch sử theo khóa.

### Giới hạn lịch sử cũ

Statev1 chỉ ghi một max toàn hệ thống, không có ledger — nhật ký đầy đủ — mã đã xóa. Dữ liệu còn lại/max cũ/02600011 là các nguồn đã biết được bảo toàn. **Không thể khôi phục mọi mã đã xóa mà chưa từng được lưu**; không tuyên bố bảo vệ lịch sử không có nguồn tin cậy. Nếu có lịch sử bổ sung, cần nâng counters tương ứng khi server dừng, không hạ chúng. Không chỉnh tay/khôi phục counter từ bản sao cũ chỉ vì danh sách hiện tại có max thấp hơn.

## 6. Luồng thêm/xóa và ghi an toàn

Thêm/xóa/initialize dùng chung hàng đợi Promise — kết quả bất đồng bộ — một tiến trình:

```text
POST /students
 → validate3 trường, cấmid/major
 → hàng đợi: validate lại, đọc sinh viên mới nhất, so email trùng
 → đọc/reconcile counters, tìm class.majorCode và cohort
 → kiểm tra suffix <99999, tạo id0YYNNNNN và so trùng toàn kho
 → reserve: ghi state counter mới trước
 → thêm model đúng5 trường, ghi JSON sinh viên
 → trảstudent sau khi lưu xong
 →303 tới trang cóstudent →GET200
```

Hai POST cùng khóa không dùng chung suffix cũ; khác khóa có counters độc lập nhưng vẫn chung hàng đợi để không mất hồ sơ. Lỗi ghi counter không ghi sinh viên. Lỗi/ngắt sau reserve không rollback — giảm lại — counter: chấp nhận bỏ qua mã. Khi một khóa đạt99999, trả409/giữ form; các khóa khác vẫn hoạt động.

GET /students/:id/delete chỉ đọc/xác nhận năm trường, không reserve/ghi. Hủy GET về danh sách. POST xóa validate MSSV URL, tìm đúng một hồ sơ, kiểm tra/reconcile counters trước xóa và ghi mảng bỏ một bản ghi. Không nhận index bảng/ID body để xóa nhiều hồ sơ. Xóa không giảm counters kể cả max/toàn kho. Sau lưu303 /students?deleted=1 về trang1; refresh không xóa thêm. Không tồn tại404/ID sai400.

writeAtomically ghi file tạm cùng thư mục, flagwx tạo mới độc quyền, flush — đẩy nội dung ghi xuống lưu trữ — rồi rename; lỗi giữ file chính và dọn file tạm của thao tác. JSON (JavaScript Object Notation — định dạng văn bản có cấu trúc) dùng UTF-8 (Unicode Transformation Format,8-bit — mã hóa Unicode). Không có giao dịch nguyên tử chung cho state/students; thứ tự reserve trước chống dùng lại mã khi tiến trình ngắt. Không tuyên bố chống mọi sự cố mất điện/ổ đĩa.

PRG (Post/Redirect/Get — POST, chuyển hướng, GET) dùng303 See Other. Refresh chỉ GET. created/deleted là cờ giao diện, không phải bằng chứng độc lập đã ghi/xóa; created chỉ hiển thị nếu mã8 chữ số có thật trong kho.

## 7. Search/Filter/Pagination SSR

GET đọc toàn bộ JSON, validate query rồi lọc trước/chia trang sau:

```text
(q rỗng OR tên chứa q OR MSSV chứa q)
AND (className rỗng OR lớp sinh hoạt trùng)
AND (major rỗng OR ngành trùng)
```

OR là hoặc, AND là và. Tìm tên/MSSV, không email; NFD (Normalization Form D — dạng tách dấu), bỏ dấu, đ→d, chữ thường/trim/gộp khoảng trắng trên bản sao so sánh, không đổi JSON. q<=100, className<=30 thuộc catalog, major<=10 thuộc majors. Query lặp/bracket/sai kiểu/control/quá dài trả400.

PAGE_SIZE20; totalPages=max(1,ceil(resultCount/20)); page=min(requestedPage,totalPages); offset=(page-1)*20; slice(offset,offset+20). Giữ thứ tự mảng. Cùng tập dữ liệu không đổi không bỏ sót/lặp khi chuyển trang.40→20/20; fixture42→20/20/2; kết quả rỗng trang1/1.

page thiếu là1, sai0/âm/thập phân/chữ/lặp/số không an toàn trả400; vượt giới hạn giới hạn về trang cuối. URLSearchParams encode — mã hóa URL — giữq/className/major. Form tìm/lọc không có page nên điều kiện mới về1; reset về /students. Không viết JSON qua GET. Filter vẫn có ngành dù formCreate không có selectmajor.

## 8. Popup/UI và xử lý lỗi

Bảng toàn chiều ngang container, sáu cột MSSV/tên/email/lớp sinh hoạt/ngành/thao tác. table-layout fixed/overflow-wrap giữ tên/email dài; bảng cuộn ngang riêng trên mobile. Semantic HTML — đánh dấu đúng ý nghĩa — label/caption/heading/skip link và focus rõ.

Popup dùng declarative HTML Popover API — cơ chế cửa sổ nổi khai báo bằng HTML — popoverauto/popovertarget/show/hide. X/Hủy typebutton không submit; Esc/Enter/Tab hỗ trợ bởi trình duyệt. Lớp sinh hoạt chiếm cả hàng trong form. Không có JS client.

POST422/409: hasFormErrors trong EJS bỏ thuộc tính popover, hiện form trực tiếp phía trên bảng, giữ tên/email/lớp hợp lệ và autofocus — tự nhận focus — trường lỗi đầu. Hủy/Đóng về GET /students. GET sau303 quay lại popup đóng. Template vẫn nhận đủ locals — biến render — cho GET/POST lỗi, không gây500 vì thiếu totalCount/catalogClasses/pagination.

Popover non-modal — không khóa tương tác/focus toàn trang — không đặt aria-modal=true. CSS fallback — dự phòng — form trực tiếp nếu không hỗ trợ; chưa thử trực tiếp trình duyệt cũ/trình đọc màn hình.

## 9. Routes, lỗi và vận hành

| Tình huống | HTTP |
|---|---|
|GET danh sách/tìm/lọc/phân trang/xác nhận hợp lệ |200HTML |
|POST thêm/xóa lưu xong |303→GET200 |
|Thiếu/sai tên/email/lớp; emailtrùng; clientid/major |422, form giữ giá trị |
|Hết suffix của khóa |409, form hiện lỗi |
|Query/IDURL sai |400 |
|IDxóa không tồn tại hoặc URL không có |404 |
|Body lớn/Content-Type sai |413/415 |
|JSON/state/ghi file lỗi |500 an toàn, không báo thành công |

Sao lưu trước nâng cấp tại data/backups/before-cohort-20261009113740363/:40 hồ sơ, state1,marker1,danh mục và seed. Main40/seed/majors giữ từng byte, danh mục được mở rộng giữ mã/ngành cũ; state/marker được migrate có chủ đích. Không phát hiện hồ sơ cũ lệch ngành/khóa; nếu có chỉ báo cáo, không tự sửa.

Di chuyển/nộp phải mang students,state,marker vì thuộc .gitignore. Phục hồi cần lịch sử tin cậy và không giảm bất kỳ counter nào; không nạp backupv1 sau khi đã cấp thêm theo v2. Chỉ một tiến trình ghi. Restart đúng server sau thay đổi danh mục/backend; không kill ngoài project.

## 10. Kiểm chứng và hạn chế

**81/81 test tự động đạt,0fail/0skip;9/9 nhóm Chrome đạt với JavaScript tắt**.70 kịch bản cũ giữ lại, cập nhật assertion — điều kiện kiểm tra — theo3 trường input/counter từngkhóa; thêm11 testCohort. Mọi POST dùng kho tạm; browser dùng bản sao40 cùng state/marker, không reset/ghi main.

Bao gồm mọi lớp, ngành từJSON/24C11, chungkhóa/kháckhóa, HTTPđồng thời, migrationfloor02611, maxv2khônggiảm, mới27, cap99999, giảmạoid/major, statehỏng/mất/downgradev1, lỗi giữa các bướcmigration, mấtcảmetadata. Các testcũ vẫn kiểm tra restart/crashthật, xóa, ghi lỗi,Unicode/XSS/SSR/query/page/PRG.

Chrome154 desktop1440×1000/mobile390×844/320×640: popup3trường, keyboard,422giữform, năm POST đúngprefix/major, xóa26/khởi tạolạistore/cấptiếp02600013, Search/Filter/Pagination, ViewSource, main40khôngđổi. Browserkhởi tạolạistore không đồng nghĩa restarttiếntrình; testtự động mới là bằngchứng restart/crash Node thực tế.

Bằng chứng hiện tại [EVIDENCE.md](EVIDENCE.md), artifacts trong evidence/cohort/. Popup/delete/final/upgrade là lịch sử, không chỉnh ảnh/log cũ thành trạng thái mới.

Giới hạn: một tiến trình ghi, chưa thử Firefox/Safari/thiết bị vật lý/trình đọc màn hình/mất điện. Không biết đầy đủ lịch sử từngkhóa đã xóa trướcv2; bảo toàn nguồn đã biết, không tự đoán. Chưa có xác thực/phân quyền hoặc CSRF (Cross-Site Request Forgery — chống giả mạo yêu cầu từ website khác) chuyên biệt; **chỉ localhost, không public Internet**. MSSV0YYNNNNN là mô phỏng học tập,không chuẩn cấp mã chính thức hoặc giải quyết trùng năm sau100năm.
