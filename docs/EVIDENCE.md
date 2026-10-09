# Bằng chứng nghiệm thu — MSSV theo khóa và ngành tự xác định từ lớp

## Phiên bản hiện tại: theo khóa tuyển sinh

Kiểm chứng09/10/2026, **81/81 test tự động PASS,0fail/0skipped;9/9 nhóm Chrome PASS**, JavaScript tắt. Chrome154.0.8037.98, Node24.18.0, Express5.2.1, EJS3.1.10 trên Windows. Bằng chứng mới ở **evidence/cohort/**; nội dung sau mục “Lịch sử trước cấp mã theo khóa” bên dưới thuộc các phiên bản cũ, không phải form/bộ đếm hiện tại.

SSR (Server-Side Rendering — kết xuất phía máy chủ), HTTP (Hypertext Transfer Protocol — giao thức truyền tải siêu văn bản), PRG (Post/Redirect/Get — POST, chuyển hướng, GET) được giữ nguyên. Không có client-side JavaScript hoặc dependency mới. Kỹ năng kiểm tra trình duyệt yêu cầu thử kết nối tích hợp trước; kết nối không khả dụng, đã kiểm tra Chrome cài sẵn bằng công cụ bên ngoài website.

### Sao lưu và dữ liệu thật

[pre-upgrade.json](evidence/cohort/pre-upgrade.json) ghi40 hồ sơ, statev1/highWaterMark02600011 và **không có hồ sơ cũ lệch khóa/ngành**. Đã dừng đúng server/watcher project trước sao lưu, không kill tiến trình ngoài phạm vi. Backup: `data/backups/before-cohort-20261009113740363/`, gồm students,state,marker,classes,majors,seed; không ghi đè backup có sẵn.

[data-preservation.json](evidence/cohort/data-preservation.json) đối chiếu SHA-256 — mã băm nội dung file — trước/sau thật:

- students.json giữ40 hồ sơ **nguyên từng byte**:6caab3dd9dd84c9bbe80d734f8c87dcd8d904bbd2ceaa0c6b2fc1262d383ff66.
- students.seed.json giữ40 mẫu nguyên bytes:287559c47c9485d6beff7aee6dbccaf12a7a2c7691fc532f17859d91a605e66c.
- majors.json không đổi.
- classes.json được mở rộng có chủ đích thành code/name/majorCode/cohort, giữ10 mã và quan hệ ngành cũ.
- State/marker được nâng cấp có chủ đích sangversion2; **không tuyên bố hash của chúng giốngv1**. Sau migration, mọi bài test đều không thay đổi state/marker/catalog chính.

Tất cả POST thêm/xóa dùng kho tạm, cùng bản sao state/marker. Server3000 chỉ GET trong kiểm thử. Không thêm lại2222/02600011, không sửa MSSV/tên/email/lớp/ngành của40 hồ sơ.

### Cơ chế đã triển khai

Form popup chỉ có name/email/className. Server tra classes.json: major=majorCode; prefix="0"+cohort; id=prefix+sequence5chữsố. Các lớp cùng khóa chung counter — bộ đếm —, kể cả ngành khác nhau. Client gửi id/major bị422, không thể ghi đè giá trị server xác định. Bộ lọc ngành GET vẫn hoạt động.

State sau migration:

```json
{
  "version": 2,
  "legacyHighWaterMark": "02600011",
  "counters": { "024": "10010", "025": "00010", "026": "00011" }
}
```

High-water mark — thứ tự lớn nhất đã cấp/giữ chỗ — không giảm.026 ít nhất00011 nhờ lịch sử mã đã biết bị xóa; mã tiếp theo khóa26 là02600012.024 kế thừa02410010, không cấp02400011 để lấp lỗ trống.25 tiếp theo02500011. Mã trong tài liệu là dự kiến khi chưa có POST khác cùng khóa.

Ghi counter trước students.json trong cùng hàng đợi thêm/xóa; lỗi/ngắt sau reserve — giữ chỗ — bỏ qua mã, không dùng lại. Hết99999 chỉ chặn khóa đó409. Marker2 ghi sau state2, chặn nạp state1 sau nâng cấp. State thiếu/hỏng/marker thiếu/hỏng hoặc **mất cả hai trên kho có hồ sơ** đều dừng an toàn, không tự seed/reset.

Giới hạn migration: statev1 không lưu toàn bộ mã đã xóa theo từng khóa. Bảo toàn dữ liệu còn lại/max cũ/mã đã biết02600011, **không thể khôi phục lịch sử chưa từng được lưu**. Không coi ảnh/test là bằng chứng khôi phục lịch sử không có nguồn dữ liệu.

### Automated tests — kiểm thử tự động

[TAP output](evidence/cohort/test-output.txt) — TAP là Test Anything Protocol, định dạng kết quả kiểm thử — ghi81test/81pass/0fail/0skip.70 kịch bản trước vẫn chạy, thay đổi assertion — điều kiện kiểm tra — phù hợp input3trường/IDtheokhóa; thêm11test trong studentCohort.test.js.

| Nhóm | Test | Kết quả |
|---|---:|---|
|Catalog/lớp-ngành-khóa hợp lệ; danh mục hỏng |3 |PASS |
|Validator/Unicode/email/cấmclientid |8 |PASS |
|Store/JSON/seed/ghi lỗi/IDtheokhóa |13 |PASS |
|Search/Pagination |5 |PASS |
|HTTP/SSR/create/query/page/popup/thuật ngữ |25 |PASS |
|Delete/counter/concurrent/crash/restart |16 |PASS |
|Cohort/migration/major/newprefix/metadata |11 |PASS |
|Tổng |81 |PASS |

Đối chiếu yêu cầu mới:

| Yêu cầu | Bằng chứng/kịch bản | Kết quả |
|---|---|---|
|24CNTT1/24VL1→024,25KHDL1→025,26TOAN1→026 |Loop mọi lớp;HTTP concurrent;Chrome |PASS |
|8 chữ số,string/0 đầu;chungkhóa khôngtrùng |So id/prefix/model, counter024chungCNTT/VL |PASS |
|Khác khóa counter độc lập;khóa mới27 |Counter từngkhóa;tiếntrình con customcatalog cấp02700001 |PASS |
|HaiPOST đồngthời |BốnPOST cácngành/khóa;emailtrùng chỉmột thànhcông |PASS |
|Restart/crash/xóa max không cấp lại |Tiếntrình Node thật reserve/crash/restart;remove/reserve cùngqueue |PASS |
|02600011 không cấp lại |Migrationv1;floor11 ngaycảstatecũ thấp;Chrome cấp02600012/13 |PASS |
|Hết5 chữsố |Counter02499999→409;25vẫn cấp02500011 |PASS |
|Ngành lấy majorCode,24C11 đúngCNTT |Loopcatalog/Chrome, không dòchuỗi |PASS |
|Lớp lạ/majorCode sai/khóa sai |Validator422;loader từ chối JSON sai |PASS |
|Clientid/major giả mạo |422 cảrỗng/đúng/sai;JSON/state khôngđổi |PASS |
|Migration an toàn |Lỗi ghistatev1 giữfile đểretry;state2/marker1 hoàn tất;marker2/state1 bịtừchối |PASS |
|Filehỏng/mất/mấtcảmetadata |Mutation/startup từchối;không tạolại state/marker |PASS |
|Popup/validation/PRG/Search/Filter/Pagination/Delete |Toàn bộ70kịchbản cũ vàChrome9nhóm |PASS |

Các lỗi write/rename được mô phỏng có kiểm soát, không gọi là lỗi ổ đĩa thật. Test crash dùng tiến trình con thử nghiệm thật, không ngắt server demo để tạo bằng chứng. Browser khởi tạo lại store không phải restart tiến trình; test Node riêng kiểm chứng restart/crash thực tế.

### Chrome với JavaScript tắt

[browser-results.json](evidence/cohort/browser-results.json) ghi2026-10-09T11:50:39.051Z (18:50:39 giờ Việt Nam),9nhóm PASS:

1. GET200/SSR20dòng, popuphaiinput/mộtselect, giữ bộlọc ngành, khôngscript.
2. PopupEnter/Tab/Esc/X; lớp hiển thị đủngành.
3. POSTrỗng422ba lỗi;emailsai giữname/class;JSON/counter khôngđổi.
4. NămPOST lớp24CNTT1/24VL1/25KHDL1/26TOAN1/24C11 đúngID/major,303→GET,refresh không thêmtrùng.
5. GETxácnhận/Hủy/POSTxóa đúnghồsơ thử02600012;khởi tạolạistore và cấp02600013, khôngdùng lại02600011/12.
6. Searchkhôngdấu/FilterAND/Reset/Pagination20/20/5 vàno-results.
7. Mobile390×844/320×640 khôngtràn trang,popup/Hủy hoạtđộng.
8. ViewSource/HTML chứa02600013 vàToán học từserver.
9. Server3000GET200;40hồsơ/seed/majors nguyênbytes, state2/catalog không bịtestghi.

Artifact mới:

| File | Nội dung |
|---|---|
|[get-students.html](evidence/cohort/get-students.html) |SSRHTML40hồsơ, form3trường, bộlọc ngành |
|[post-invalid.html](evidence/cohort/post-invalid.html) |422giữname/class, lỗiemail, khôngpopover |
|[post-create-headers.json](evidence/cohort/post-create-headers.json) |NămPOST303, Location vàID/major đúng |
|[filtered-ssr.html](evidence/cohort/filtered-ssr.html) |GETlọc chứa02600013/Toán học |
|[request-log.txt](evidence/cohort/request-log.txt) |Log middleware thật, không ghi body |
|[popup-three-fields.png](evidence/cohort/popup-three-fields.png) |Popup3trường,nềnphủ, nhãnLớpsinhhoạt |
|[validation-422.png](evidence/cohort/validation-422.png) |Formlỗi hiệntrực tiếp, giữlớp26TOAN1 |
|[created-cohorts.png](evidence/cohort/created-cohorts.png) |CácID/major mới trênkhotạm |
|[mobile-popup-390.png](evidence/cohort/mobile-popup-390.png) |Mobile390px |
|[mobile-popup-320.png](evidence/cohort/mobile-popup-320.png) |Mobile320px,cuộnnội bộ |
|[view-source.png](evidence/cohort/view-source.png) |ViewSource thật, dữliệu trongHTML |
|[live-results.json](evidence/cohort/live-results.json) |GET200serverdemo sau nângcấp |
|[handoff-results.json](evidence/cohort/handoff-results.json) |Kiểm tra bàn giao sau tài liệu:14 fileJS, liên kết,40 hồ sơ, mapping lớp/ngành và GET200/400/404 |

Ảnh/log thật, đã xem trực quan, không tạo bằng chứng giả. Cổng trên ảnh là cổng tạm; mọi POST chỉ ghi bản sao. Đã thử kết nối trình duyệt tích hợp theo kỹ năng trước khi dùng Chrome cài sẵn; công cụ QA (Quality Assurance — bảo đảm chất lượng) không là dependency của website.

Trích log thật:

```text
2026-10-09T11:50:33.577Z POST /students 422 36.1ms
2026-10-09T11:50:34.317Z POST /students 303 36.7ms
2026-10-09T11:50:34.326Z GET /students 200 6.3ms
```

### Routes, demo và checklist

GET /students?q=...&className=...&major=...&page=... →200 HTML. POST /students → validate ba trường → suy ngành → reserve MSSV → ghi JSON →303; GET/POST /students/:id/delete vẫn xác nhận/xóa. Trả422 khi input sai, client gửi id/major hoặc email trùng;409 khi hết counter;400 khi query/ID URL sai;404 khi không tồn tại;413 khi body lớn/415 khi sai Content-Type;500 an toàn khi lỗi đọc/ghi, không báo thành công giả.

Serverdemo **http://127.0.0.1:3000/students**, chạy `npm.cmd run dev`, chỉ một listener. Muốn thử thêm/xóa mà giữ40hồsơ, sao chép source cùngstudents/state/marker/danhmục sang thưmụcriêng, chạy `$env:PORT="3001"`; không reset main sau demo.

Trên bản sao: tắt JavaScript, mở popup, chọn từng lớp khóa24/25/26 và kiểm tra303/ID/major. Xóa mã lớn nhất của khóa26 rồi thêm/restart: mã tiếp tục tăng. Gửi form rỗng/sai email để thấy422 và lớp được giữ. Thử Search/Filter/Reset/chuyển trang; Ctrl+U xem source và Network đối chiếu POST303→GET200. Chạy `npm.cmd test` cho các bài kiểm thử đồng thời/migration/lỗi ghi.

| Đạt | Yêu cầu | Đối chiếu |
|---|---|---|
|✓ |Express/EJS/JSON/SSR,khôngclientJS/database/ORM |HTML/Chrome/app |
|✓ |Form3trường,giữpopup/lỗi422/303 |partial/router/HTTP/ảnh |
|✓ |MSSV0YYNNNNN,counterchungkhóa/độc lậpkháckhóa |store/state/11testCohort |
|✓ |Ngành từmajorCode,kểcả24C11;chặnclientid/major |catalog/validator/tests |
|✓ |Không dùnglại02600011/xóa/restart/crash |floor/counters/marker/tests |
|✓ |Bảo toàn40hồsơ/mã/ngành cũ,backuptrướcsửa |hash/pre-upgrade/data-preservation |
|✓ |Search/Filter/Pagination20/Delete khônghỏng |70regression/Chrome |
|✓ |SSR/UTF-8/Unicode/escape/bodylimit/errorsafe |HTTP/validator/securityheader |
|✓ |README/technical/evidence cậpnhậtthật |ba tài liệu/evidence/cohort |

Giới hạn: lịch sử từng khóa chưa được lưu không thể suy đầy đủ; chỉ một tiến trình ghi, chưa thử Firefox/Safari/trình đọc màn hình/thiết bị thật/mất điện. Chưa có xác thực/phân quyền hoặc CSRF chuyên biệt; chỉ localhost, không public Internet. Counter/marker/catalog thay đổi có chủ đích;40 hồ sơ không thay đổi. Chi tiết trong báo cáo kỹ thuật.

---

## Lịch sử trước cấp mã theo khóa

Nội dung/ảnh/log dưới đây được giữ làm lịch sử; số70/69/65test, formchọnngành và bộđếm toànhệthống không còn đại diện phiênbản hiện tại.

## Cập nhật thuật ngữ lớp sinh hoạt

Sau phiên bản popup, đã đổi nhãn lớp thành **Lớp sinh hoạt (lớp hành chính)** trên bảng, form, bộ lọc, điều kiện đang áp dụng, caption và trang xác nhận xóa; cập nhật chuỗi validation/query tương ứng. `className`, JSON, danh mục và logic cấp MSSV giữ nguyên. README/technical report giải thích đây không phải lớp học phần; dự án chưa quản lý đăng ký học phần.

Chạy thực tế `npm.cmd test`: **70 test/70 pass/0 fail/0 skipped**, trên kho tạm. Test mới cuối `tests/students.http.test.js` kiểm tra đầy đủ nhãn, select/query vẫn dùng `className`, lỗi422/400 đúng thuật ngữ và JSON/counter không đổi. Server demo GET /students, GET lọc className=24CNTT1&major=CNTT và GET /students/02400001/delete đều200/có nhãn mới. Đối chiếu hash sinh viên/danh mục lớp-ngành/state/marker trước/sau không đổi.

Không chạy lại Chrome/chụp ảnh cho thay đổi nhãn này. Các artifact69 test/12 nhóm Chrome và ảnh bên dưới là bằng chứng thật **của lần triển khai popup trước đổi thuật ngữ**, không chỉnh sửa chúng để giả lập nhãn mới.

## A. Kết quả hiện tại

Kiểm chứng **09/10/2026 lúc18:02 giờ Việt Nam** trên Chrome154.0.8037.98, Windows. SSR (Server-Side Rendering — kết xuất phía máy chủ) bằng Express/EJS được giữ nguyên. Không đổi backend/routes/danh mục/dependency, không có JavaScript phía client.

**69/69 test tự động PASS, 0 fail/bỏ qua; 12/12 nhóm Chrome PASS với JavaScript tắt.** Giữ65 test cũ, bổ sung4 test trong `tests/students.http.test.js`. Kỹ năng kiểm tra trình duyệt yêu cầu thử kết nối trình duyệt tích hợp trước; kết nối không khả dụng nên dùng Chrome cài sẵn với công cụ kiểm thử bên ngoài. Công cụ đó không phải dependency của website.

Kết quả và ảnh **hiện tại** nằm trong `evidence/popup/`. Các mục1–9 bên dưới là **lịch sử phiên bản xóa trước popup**, được giữ nguyên để không mất bằng chứng cũ; số42 và65 test ở đó không phải trạng thái hiện tại.

### Bảo toàn dữ liệu

Ngay trước sửa UI (User Interface — giao diện người dùng), file thật đã có **40 sinh viên**, không còn hồ sơ2222/02600011; state vẫn giữ02600011. Không phục hồi/xóa/seed lại dữ liệu. Mọi POST kiểm thử chỉ dùng bản sao tạm **có đủ students/state/marker**, cổng ngẫu nhiên; cổng3000 chỉ nhận GET trong kiểm thử.

[Đối chiếu SHA-256 — mã băm nội dung file](evidence/popup/data-preservation.json):

| File | Trước/sau | SHA-256 không đổi |
|---|---|---|
| students.json |40 →40 hồ sơ |6caab3dd9dd84c9bbe80d734f8c87dcd8d904bbd2ceaa0c6b2fc1262d383ff66 |
| students.seed.json |40 mẫu, không tạo lại |287559c47c9485d6beff7aee6dbccaf12a7a2c7691fc532f17859d91a605e66c |
| students.id-state.json |02600011 →02600011 |72000ca8abfdd96d38349b391995126893e68ad03050ba4e29037a7f6cf3e88c |
| students.id-state.json.initialized |Giữ nguyên marker — dấu mốc |50208d78350a7a160dec59a82df1499b6ca7da33e54c5eb11c97e342118e68bb |

### Kiểm thử tự động chạy thật

[TAP output](evidence/popup/test-output.txt) — TAP là Test Anything Protocol, định dạng kết quả kiểm thử — ghi69 test/69 pass/0 fail/0 skipped.

| Nhóm | Test | Kết quả |
|---|---:|---|
| Validator |8 |PASS |
| Store/cấp mã/ghi JSON |13 |PASS |
| Catalog lớp/ngành |3 |PASS |
| Search/Pagination |5 |PASS |
| Delete/counter/ghi lỗi/crash/restart |16 |PASS |
| HTTP/SSR/form/Search/Filter/Pagination/popup |24 |PASS |
| Tổng |69 |PASS |

Test mới xác nhận GET chỉ có một form, mở/đóng declarative — khai báo bằng HTML; POST422 không có thuộc tính popover, giữ giá trị/focus và không ghi; lỗi chung/clientID/409 hiện form; sau303 trở lại popup; empty/no-results vẫn có nút mở. Các test cũ tiếp tục kiểm tra email trùng, ID duy nhất, concurrent — thao tác gần nhau — restart, escape HTML và xóa an toàn.

### Chrome với JavaScript tắt

[browser-results.json](evidence/popup/browser-results.json) ghi timestamp thật2026-10-09T11:02:23.670Z,12 nhóm:

| Nhóm | Kết quả |
|---|---|
| GET200/SSR6 cột, không script; bảng1360px/container1360px ở màn hình1440px |PASS |
| Mở/X/Hủy, popup640px giữa màn hình có overlay — nền phủ; không ghi |PASS |
| Enter mở, autofocus tên, Tab email/outline3px, Esc đóng/trả focus nút mở |PASS |
| Form rỗng422: bốn lỗi và form hiển thị trực tiếp, JSON không đổi |PASS |
| Email sai422: giữ tên/ngành/lớp, focus email; Hủy không ghi |PASS |
| Thêm trong popup cấp02600012 trên bản sao,303→GET200; refresh hai lần không thêm trùng |PASS |
| Search không dấu/AND lớp-ngành/giữ giá trị/Reset/Pagination/no-results |PASS |
| Xóa GET/Hủy/POST303 vẫn hoạt động; chỉ xóa hồ sơ kiểm thử; counter giữ nguyên |PASS |
| Tên100 ký tự/email dài không làm vỡ cột/tràn desktop |PASS |
| Mobile390×844 và320×640 không tràn trang; bảng cuộn riêng, popup/Hủy hoạt động |PASS |
| View Source thật có sinh viên đã lọc và markup popup/form |PASS |
| Server demo GET200 dùng template mới; bốn file dữ liệu chính không đổi |PASS |

Browser chạy `javaScriptEnabled:false`. Việc công cụ QA (Quality Assurance — bảo đảm chất lượng) đọc kích thước/focus không thêm script vào website. Không tuyên bố đã kiểm tra trình đọc màn hình hoặc trình duyệt cũ.

## B. HTTP và artifact thật của phiên bản popup

Các route không thay đổi: GET /students, POST /students, GET/POST /students/:id/delete. Popup chỉ mở/đóng HTML có sẵn, **không tạo request mới hoặc thay đổi dữ liệu**. Form bên trong gửi POST bình thường.

POST lỗi422/409: server trả HTML với lỗi; EJS bỏ `popover` nên form nằm trực tiếp trên bảng. POST hợp lệ: lưu dữ liệu/bộ đếm xong, trả303 rồi GET. PRG (Post/Redirect/Get — gửi POST, chuyển hướng, tải lại bằng GET) không đổi.

[Request log thật của kho tạm](evidence/popup/request-log.txt), trích nguyên văn:

```text
2026-10-09T11:02:16.655Z POST /students 422 122.2ms
2026-10-09T11:02:18.576Z POST /students 303 49.9ms
2026-10-09T11:02:18.596Z GET /students 200 12.7ms
```

[Header POST thành công](evidence/popup/post-create-headers.json) có Location `/students?created=02600012&page=3`. Cổng52380 là server dữ liệu tạm. Mã02600012 **không được thêm vào dữ liệu thật**.

[Kiểm tra server demo](evidence/popup/live-results.json): GET /students200/20 hàng; page=2 là200/20 hàng; tìm/lọc q=nguyen&className=24CNTT1&major=CNTT là200/1 hàng; trang xác nhận02400001 trả200. Không cần restart vì server đang chạy đã render template mới; không tạo thêm server ghi cùng file.

[Kiểm tra bàn giao sau cập nhật tài liệu](evidence/popup/handoff-results.json) xác nhận các liên kết nội bộ tồn tại, hash cả bốn file không đổi, GET200 và page=0 trả400; page=3 được giới hạn về trang2 có20 hàng với kho40 hồ sơ.

| Artifact | Nội dung |
|---|---|
| [get-students.html](evidence/popup/get-students.html) |HTML200 có sinh viên/form/popover trước mọi thao tác client |
| [post-invalid.html](evidence/popup/post-invalid.html) |HTML422 có tên/ngành/lớp giữ lại, lỗi email, form không có popover |
| [desktop-full-width.png](evidence/popup/desktop-full-width.png) |Bảng toàn chiều ngang và nút mở bên phải |
| [desktop-popup.png](evidence/popup/desktop-popup.png) |Popup giữa màn hình, overlay và các trường |
| [validation-422.png](evidence/popup/validation-422.png) |Lỗi và form SSR hiển thị trực tiếp phía trên bảng |
| [create-success.png](evidence/popup/create-success.png) |Thông báo/mã mới sau303 trên kho tạm |
| [mobile-popup-390.png](evidence/popup/mobile-popup-390.png) |Popup mobile390px |
| [mobile-popup-320.png](evidence/popup/mobile-popup-320.png) |Popup nhỏ320px đã cuộn để thấy Hủy/Thêm; tiêu đề/X ở phía trên |
| [view-source.png](evidence/popup/view-source.png) |View Source thật chứa sinh viên đã lọc |

Ảnh đã xem trực quan; không tạo ảnh/log/kết quả giả. Ảnh popup mobile thể hiện form đang cuộn xuống khu vực nút, không phải lỗi mất tiêu đề. Cuộn lên để dùng X, hoặc dùng Hủy/Esc.

## C. Hướng dẫn demo popup và giới hạn

1. Mở **http://127.0.0.1:3000/students**, nhấn “+ Thêm sinh viên”: form giữa màn hình, bảng không còn cột bên phải.
2. Thử X/Hủy hoặc Enter/Tab/Esc; không submit vào server thật nếu muốn giữ dữ liệu.
3. Tắt JavaScript trong DevTools (công cụ phát triển trình duyệt), reload và thử lại mở/đóng/Search/Filter/Pagination.
4. Muốn thử422/303/thêm/xóa: dùng **bản sao source và đủ ba file dữ liệu/state/marker**, chạy cổng3001 như hướng dẫn lịch sử bên dưới. Form rỗng/sai trả422, hiện trực tiếp; sửa hợp lệ trả303 và GET thấy mã mới. Refresh không tạo thêm hồ sơ.
5. Kiểm tra mobile390×844/320×640: popup cuộn nội bộ, bảng cuộn ngang riêng. Ctrl+U xem dữ liệu đã có trong source; Network kiểm tra POST422/303 và GET200.
6. Chạy `npm.cmd test`:69 test đều dùng kho tạm, không thêm/xóa dữ liệu thật.

Popover là non-modal — không khóa tương tác/focus toàn trang. Trình duyệt cần hỗ trợ `popover`/`popovertarget` để có popup; HTML/CSS dự phòng hiển thị form trực tiếp nếu không hỗ trợ. Fallback POST422/409 đã kiểm tra; fallback trên trình duyệt cũ chưa kiểm tra trực tiếp. Chưa thử Firefox/Safari/thiết bị vật lý/trình đọc màn hình. Tham khảo [MDN Popover](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using).

Không có xác thực/phân quyền/CSRF chuyên biệt; chỉ demo localhost. Không sửa logic cấp MSSV, ghi JSON, validation, danh mục hoặc route để làm popup. Checklist12 yêu cầu UI tương ứng12 nhóm Chrome và4 test HTTP mới ở trên; toàn bộ65 regression tests — kiểm thử hồi quy — vẫn đạt.

---

## Lịch sử — phiên bản xóa trước khi có popup

Các mục1–9 sau ghi kết quả tại thời điểm triển khai xóa; **không phải số lượng sinh viên hoặc giao diện hiện tại**. Không sửa nội dung/log lịch sử thành kết quả mới.

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
