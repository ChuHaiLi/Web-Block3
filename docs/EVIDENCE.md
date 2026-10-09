# Bằng chứng nghiệm thu — Student Management SSR có xóa

## 1. Kết quả thực tế và môi trường

Kiểm chứng ngày **09/10/2026**, Node.js24.18.0, npm11.16.0, Express5.2.1, EJS3.1.10, Chrome154.0.8037.98 trên Windows.

SSR (Server-Side Rendering — kết xuất phía máy chủ), HTTP (Hypertext Transfer Protocol — giao thức truyền tải siêu văn bản), PRG (Post/Redirect/Get — gửi POST, chuyển hướng, tải lại bằng GET) là trọng tâm bài tập.

**65/65 test tự động PASS; 10/10 nhóm Chrome PASS với JavaScript tắt.** Không có test lỗi/bỏ qua. Không cài dependency — thư viện phụ thuộc — mới. Mọi POST kiểm thử thêm/xóa dùng file JSON tạm riêng; server demo thật chỉ được kiểm tra GET.

Artifact — tệp kết quả kiểm chứng — mới ở **evidence/delete/**. `final/` ghi49 test/12 nhóm Chrome trước khi có xóa, `upgrade/` ghi36 test/8 nhóm ở lần nâng cấp trước, evidence gốc có form nhập MSSV cũ. Các bản này được giữ làm lịch sử, không coi là bằng chứng giao diện hiện tại.

## 2. Backup và bảo toàn dữ liệu

Đã kiểm tra42 sinh viên trước sửa, dừng đúng server/watcher thuộc project và sao lưu trước khi sửa source. Backup không ghi đè bản có sẵn:

- `data/backups/students-before-delete-20261009-171809.json`: nguyên vẹn42 hồ sơ.
- `data/backups/students-before-delete-20261009-171809.id-state.json`: counter sau khi khởi tạo từ dữ liệu hiện có.
- `data/backups/students-before-delete-20261009-171809.id-state.json.initialized`: marker — dấu mốc đã khởi tạo.

SHA-256 — mã băm/dấu vân tay nội dung file — được đối chiếu thật:

| File | Số lượng/trạng thái | Hash không đổi trong kiểm thử |
|---|---|---|
| students.json | 42, vẫn có2222 và02600011 | 7e785a40f427ee942ebd3ae8af0a8508b8e3f7ce72f6dc862a5186fa82102567 |
| students.seed.json | 40 mẫu, không tạo lại | 287559c47c9485d6beff7aee6dbccaf12a7a2c7691fc532f17859d91a605e66c |
| students.id-state.json | highWaterMark02600011 | 72000ca8abfdd96d38349b391995126893e68ad03050ba4e29037a7f6cf3e88c |

[Bảo toàn dữ liệu](evidence/delete/data-preservation.json) ghi hash trước/sau và xác nhận backup khớp. Không có sinh viên thật nào bị xóa/thêm trong triển khai hoặc kiểm thử.

Kho Chrome là bản sao42. Xóa max02600011 thành41, tạo hồ sơ giả lập02600012 thành42, thêm tên HTML kiểm tra escape thành43. Những thay đổi/ảnh này thuộc kho tạm, không phải danh sách demo thật. Không xóa dữ liệu thật rồi reset JSON để kiểm thử.

State và marker là một phần dữ liệu bền vững, không được bỏ khi đóng gói hoặc di chuyển. Counter cũ trong backup không được phục hồi thấp hơn mã lớn nhất đã từng reserve — giữ chỗ — sau thời điểm backup. Mất đồng thời cả state/marker cần xử lý thủ công bằng lịch sử đáng tin cậy, không suy counter từ hồ sơ còn lại.

## 3. Routes và kết quả server thật

| Method/URL | Vai trò | Response |
|---|---|---|
| GET /students | Danh sách/tìm/lọc/phân trang | 200 HTML |
| POST /students | Validate, reserve MSSV, thêm, ghi | 303 sau thành công |
| GET /students/:id/delete | Xác nhận đủ năm trường | 200; không ghi |
| POST /students/:id/delete | Xóa đúng một MSSV trong hàng đợi | 303 /students?deleted=1 |
| ID không tồn tại | GET/POST xóa | 404 |
| ID URL sai | GET/POST xóa | 400 |
| Lỗi đọc/ghi/state | Thao tác ghi không được xác nhận | 500, không lộ stack trace |
| Validation tạo sai / hết mã | Không thêm hồ sơ | 422 / 409 |

Các bảo vệ415 Content-Type sai,413 body lớn và404 URL không có vẫn giữ nguyên.

[Kiểm tra server demo](evidence/delete/live-results.json) sau restart:

| URL | Status | Số hàng |
|---|---|---:|
| /students | 200 | 20 |
| /students?page=2 | 200 | 20 |
| /students?page=3 | 200 | 2 |
| /students/02600011/delete | 200 | Trang xác nhận |
| /students/2222/delete | 200 | Trang xác nhận |
| /students/NO-SUCH-ID/delete | 404 | Không xóa |

Website vẫn mở tại **http://127.0.0.1:3000/students**. Chỉ một server project ghi bộ dữ liệu chính. Kho kiểm thử dùng cổng ngẫu nhiên và file khác.

## 4. Cơ chế xóa và không dùng lại MSSV

Nút Xóa trong cột Thao tác là liên kết GET, không thực hiện xóa. Trang EJS hiển thị MSSV/tên/email/lớp/ngành, cảnh báo “Bạn có chắc chắn muốn xóa sinh viên này? Hành động này không thể hoàn tác.” Hủy là GET về danh sách. Chỉ form xác nhận methodPOST mới gọi remove.

Remove tìm theo MSSV từ URL đã validate, không nhận index của bảng hoặc ID khác trong body. Đọc dữ liệu mới nhất, kiểm tra high-water mark — mã lớn nhất từng cấp/giữ chỗ — và ghi mảng bỏ đúng một bản ghi. Add/remove chung một hàng đợi. Lỗi ghi không trả303 hoặc báo thành công; file cũ được giữ.

Counter ở `students.id-state.json`; marker ở `students.id-state.json.initialized`. Bootstrap — khởi tạo đầu — ghi marker trước, rồi counter từ dữ liệu đang có, trước khi mở server cho phép xóa. Lần thêm ghi counter trước JSON sinh viên, không rollback — giảm lại — nếu bước sau lỗi/ngắt. Chấp nhận bỏ qua mã, không dùng lại.

State/marker hỏng/mất sau khởi tạo khiến startup hoặc thao tác ghi dừng an toàn. Không tự seed/reconstruct counter từ danh sách có thể đã xóa. Xóa hết sinh viên vẫn giữ counter và không seed lại. Tài liệu kỹ thuật giải thích điểm lỗi giữa hai lần ghi; không tuyên bố hai file có giao dịch nguyên tử chung hoặc bảo đảm mọi sự cố mất điện.

## 5. Kiểm thử tự động

[TAP output](evidence/delete/test-output.txt) — TAP là Test Anything Protocol, định dạng kết quả kiểm thử — ghi65 test,0 fail,0 skipped.

| Nhóm/file | Số test | Kết quả |
|---|---:|---|
| Validator: Unicode/email/kiểu/ID cũ/cấm id client | 8 | PASS |
| Store: seed/ghi lỗi/hàng đợi/cấp mã/danh mục | 13 | PASS |
| HTTP hồi quy: SSR/create/search/filter/page/restart | 20 | PASS |
| Catalog: bốn ngành/mười lớp/24C11/quan hệ hợp lệ | 3 | PASS |
| Search/Pagination:20/20/2, query, page an toàn | 5 | PASS |
| studentDelete.test.js: xác nhận/xóa/counter/crash | 16 | PASS |
| Tổng | 65 | PASS |

49 test trước không bị bỏ. Chỉ điều chỉnh assertion — điều kiện kiểm tra — từ5 cột thành6 vì Thao tác, danh sách file có metadata mới và khởi tạo kho rỗng trước thao tác ghi.

Đối chiếu15 yêu cầu kiểm thử xóa:

| Yêu cầu | Bằng chứng | Kết quả |
|---|---|---|
| 1–2. GET xác nhận200, đúng sinh viên/năm trường | HTTP test, get-confirm.html, ảnh | PASS |
| 3–4. GET/Hủy không ghi JSON/state | HTTP/Chrome đối chiếu từng byte | PASS |
| 5–6. Xóa đúng một sinh viên, giữ mọi hồ sơ khác | So toàn bộ mảng sau xóa; bodyID khác không ảnh hưởng | PASS |
| 7–8. POST303, GET không còn hồ sơ đã xóa | Header/log/after-delete.html | PASS |
| 9. ID không tồn tại | GET/POST404, file không đổi | PASS |
| 10. Refresh không xóa thêm | Ba GET trong test, hai reload Chrome | PASS |
| 11. Xóa max không cấp lại | Xóa02600011, mã tiếp theo02600012 trên bản sao | PASS |
| 12. Restart giữ counter | Tiến trình Node thật: ngắt sau reserve; restart, xóa max, restart lần nữa | PASS |
| 13. Search/Filter/Pagination vẫn hoạt động |49 test hồi quy và Chrome | PASS |
| 14. JavaScript tắt | Browser javaScriptEnabled:false, GET/POST/Hủy dùng HTML | PASS |
| 15. Toàn bộ test cũ |65 tổng gồm49 cũ | PASS |

Kiểm thử bổ sung:

- Hai yêu cầu xóa cùng mã chỉ một303/một404.
- Thêm/xóa đồng thời không mất hồ sơ khác, không trùng mã.
- Lỗi ghi JSON xóa trả500, không redirect/thông báo thành công, retry sau lỗi hoạt động.
- Ghi state lỗi không ghi sinh viên; ghi sinh viên lỗi sau reserve giữ counter tăng.
- State/marker hỏng hoặc mất từ chối thao tác/restart, không tạo lại.
- Bootstrap ngắt sau marker không tự đoán max.
- ID URL bất thường không làm thay đổi đường dẫn dữ liệu.
- MSSV legacy dạng chữ/gạch nối được tìm/xóa, mã hồ sơ khác không đổi.
- XSS (Cross-Site Scripting — chèn mã vào trang) được escape — chuyển ký tự HTML thành văn bản — trong xác nhận và aria-label.

Các lỗi write/rename được mô phỏng có kiểm soát. Ngắt tiến trình sau reserve là kill tiến trình con thử nghiệm thật; không kill server hoặc tiến trình ngoài project để thử crash. Không giả lập bằng chứng như sự cố ổ đĩa thật/mất điện.

## 6. Chrome, HTTP log và PRG thực tế

[Browser results](evidence/delete/browser-results.json) ghi Chrome154.0.8037.98, JavaScript tắt, hoàn tất **2026-10-09T10:29:12.365Z** (17:29:12 giờ Việt Nam),10 nhóm PASS:

1. Danh sách SSR200 có6 cột,20 nút Xóa ở trang1, không script.
2. Từ Search/Filter tới GET xác nhận đúng hồ sơ, không ghi.
3. Hủy về danh sách, giữ JSON/counter.
4. POST xóa max trên bản sao,303→GET200, chỉ41 hồ sơ, refresh không xóa thêm.
5. Thêm tiếp02600012, không dùng lại02600011, form/PRG hoạt động.
6. Search không dấu, Filter/Reset/Pagination20/20/2 cùng nút Xóa.
7. HTML nguy hiểm trong tên hiển thị văn bản, không tạo script.
8. Mobile390×844, mở xác nhận từ trang3, không tràn trang, Hủy không ghi.
9. View Source thật có hồ sơ/formPOST render từ server.
10. Server demo GET200/404 đúng, dữ liệu thật/seed/counter không đổi.

[Request log](evidence/delete/request-log.txt) được middleware thật sinh trên kho Chrome tạm. Chuỗi đã ghi:

```text
2026-10-09T10:29:09.068Z POST /students/02600011/delete 303
2026-10-09T10:29:09.076Z GET /students 200
```

Log gốc còn có thời gian xử lý; đoạn trên trích phần request/status. [Header POST](evidence/delete/post-delete-headers.json) chứa Location=/students?deleted=1. Log không ghi body/query nhạy cảm.

Refresh lặp GET, không gửi lại POST. POST cùng mã đã xóa404. Cờ deleted=1 chỉ phục vụ thông báo, có thể được nhập URL/hiện lại khi refresh; không dùng cờ làm bằng chứng giao dịch độc lập.

## 7. Artifact mới

| File | Nội dung |
|---|---|
| [test-output.txt](evidence/delete/test-output.txt) |65 test chạy thật |
| [browser-results.json](evidence/delete/browser-results.json) |10 nhóm Chrome/JavaScript tắt/timestamp |
| [data-preservation.json](evidence/delete/data-preservation.json) |42 thật/40 seed/counter/backup nguyên vẹn |
| [live-results.json](evidence/delete/live-results.json) |GET cổng3000 sau restart |
| [handoff-results.json](evidence/delete/handoff-results.json) |Kiểm tra sau cùng:65 test,13 file JS,liên kết tài liệu,GET200/400/404 và bốn file dữ liệu không đổi |
| [get-confirm.html](evidence/delete/get-confirm.html) |HTML có sẵn năm trường/cảnh báo/formPOST |
| [get-confirm-headers.json](evidence/delete/get-confirm-headers.json) |GET200/URL/header thực tế |
| [post-delete-headers.json](evidence/delete/post-delete-headers.json) |POST303/Location |
| [after-delete.html](evidence/delete/after-delete.html) |HTML sau redirect,41 hồ sơ trên bản sao |
| [request-log.txt](evidence/delete/request-log.txt) |GET xác nhận, POST xóa303, GET sau redirect và POST thêm |
| [desktop-actions.png](evidence/delete/desktop-actions.png) |Cột Thao tác/nút Xóa |
| [confirm-delete.png](evidence/delete/confirm-delete.png) |Xác nhận desktop, đúng hồ sơ |
| [delete-success.png](evidence/delete/delete-success.png) |Thông báo sau lưu |
| [new-id-after-delete.png](evidence/delete/new-id-after-delete.png) |Mã02600012 sau xóa02600011 trên bản sao |
| [mobile-confirm.png](evidence/delete/mobile-confirm.png) |Xác nhận mobile, hai nút đầy đủ |
| [confirm-view-source.png](evidence/delete/confirm-view-source.png) |View Source thật chứa sinh viên/form |

Ảnh đã được xem trực quan, không tạo ảnh/log giả. Cổng trên ảnh Chrome là cổng tạm. Playwright là công cụ kiểm tra bên ngoài, không là dependency website hoặc script trong trang. UTC (Coordinated Universal Time — giờ phối hợp quốc tế) trong log cộng7 giờ để đổi sang giờ Việt Nam.

## 8. Hướng dẫn demo an toàn

### Chỉ xem/Hủy trên server thật

1. Mở http://127.0.0.1:3000/students, có42 hồ sơ và6 cột.
2. Nhấn Xóa trên một hàng: URL GET /students/MSSV/delete.
3. Kiểm tra đủ năm trường/cảnh báo, nhấn Hủy: danh sách không đổi.
4. Thử trên kết quả tìm/lọc hoặc trang3; vẫn chọn đúng MSSV.
5. Ctrl+U để xem source chứa hồ sơ/form; không dùng ảnh giao diện đơn thuần thay cho bằng chứng SSR.

### Thử xóa thật trên bản sao

1. Dừng server của bản sao nếu có; sao chép source và toàn bộ file sinh viên/state/marker vào thư mục khác.
2. Terminal bản sao: cài nếu cần và chạy cổng khác:
   ```powershell
   npm.cmd ci
   $env:PORT = "3001"
   npm.cmd run dev
   ```
3. Mở127.0.0.1:3001/students, DevTools — công cụ phát triển trình duyệt — Network, bật Preserve log — giữ lịch sử request.
4. Xác nhận xóa mã lớn nhất: POST303→GET200, tổng giảm1, hồ sơ khác giữ nguyên.
5. Refresh hai lần, tổng không giảm thêm.
6. Thêm hồ sơ giả lập email example.com: mã mới lớn hơn mã đã xóa.
7. Ctrl+C trong đúng terminal bản sao, chạy lại, mã cấp tiếp tục tăng.
8. Không chạy hai server cùng một thư mục dữ liệu; không xóa trên cổng3000 rồi reset file chính.

### JavaScript tắt và mobile

Chrome DevTools → Ctrl+Shift+P → Disable JavaScript, reload. Xóa/Hủy/Xác nhận/Thêm/Search/Filter/Pagination đều dùng HTML bình thường. Ctrl+Shift+M đặt390×844; bảng cuộn ngang riêng, trang xác nhận không tràn. Chụp Network/header/Response/terminal và View Source thật.

### State hỏng/mất

Chỉ thử trên kho tạm bằng test tự động:

```powershell
npm.cmd test
```

Nếu kho sử dụng thật gặp lỗi state, dừng server và giữ nguyên mọi file để chẩn đoán; không xóa marker/state hoặc seed lại. Khôi phục state hợp lệ từ lịch sử tin cậy, không hạ counter dưới mã từng reserve. Không có cơ chế tự khôi phục lịch sử đã mất.

## 9. Checklist và hạn chế

| Đạt | Yêu cầu | Đối chiếu |
|---|---|---|
| ✓ | Express/EJS SSR, không clientJS/database/ORM |app/template/HTML/Chrome |
| ✓ | GET/POST danh sách/create, model5 trường, danh mục |49 test hồi quy |
| ✓ | Seed40UTF-8, giữ42 thật/MSSV2222/02600011 |backup/hash |
| ✓ | GET xác nhận đủ thông tin, Hủy không ghi |template/GET/Chrome |
| ✓ | POST xóa đúng một mã,303 sau lưu, refresh an toàn |store/router/log/tests |
| ✓ | Bộ đếm bền vững, không tái sử dụng khi xóa/restart/crash |state/marker/16 test |
| ✓ | Hàng đợi chung thêm/xóa, lỗi ghi giữ JSON |concurrent/failure tests |
| ✓ | Search/Filter/Pagination20 không bị ảnh hưởng |unit/HTTP/Chrome |
| ✓ | ValidateID/escape/không ghép ID thành file path |validator/router/store/tests |
| ✓ | Responsive, semanticHTML, cảnh báo rõ |desktop/mobile ảnh |
| ✓ | README/technical report/evidence cập nhật thật |ba tài liệu/evidence/delete |

Giới hạn: một tiến trình ghi, chưa thử Firefox/Safari, thiết bị vật lý/trình đọc màn hình hoặc mất điện. Website chưa có xác thực/phân quyền hoặc CSRF (Cross-Site Request Forgery — chống giả mạo yêu cầu từ website khác) chuyên biệt. **Chỉ demo localhost, không public Internet.** Trang xác nhận không thay thế kiểm soát truy cập.

Sự cố500 cũ do route cached — giữ trong bộ nhớ — thiếu totalCount vẫn được ghi nhận lịch sử. Hiện renderPage chung cung cấp cả deleted/pagination/catalogClasses, các GET/POST lỗi đã được kiểm thử và đúng server đã restart. Không chữa lỗi bằng reset dữ liệu.
