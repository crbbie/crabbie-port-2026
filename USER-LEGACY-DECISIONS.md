# CRABBIE REDESIGN — USER LEGACY DECISIONS

## Metadata

- Generated: 2026-10-01T13:55:51.938Z
- Source inventory: SITE-INVENTORY.md
- Source audit: LEGACY-MAP.md
- Decision owner: USER
- Decision status: COMPLETE
- Resolved: 58 / 58

## Decision Legend

- KEEP_EXACT — Giữ nguyên: giữ component/feature hiện tại gần như nguyên bản.
- KEEP_BEHAVIOR_REDESIGN_VISUAL — Giữ chức năng, đổi giao diện: giữ chức năng, dữ liệu và behavior cần thiết, giao diện có thể thiết kế lại.
- REPLACE — Thay mới: không cần giữ implementation/presentation cũ, có thể xây lại cho redesign.
- REMOVE — Bỏ: feature/component này không xuất hiện trong redesign.
- UNSURE — Chưa chắc: chưa muốn quyết định ở thời điểm này.

Motion legend:

- KEEP_EXISTING_MOTION — giữ motion hiện tại
- NEW_MOTION — làm motion mới
- STATIC — để tĩnh
- UNSURE — chưa chắc
- N_A — không có chiều chuyển động

## Tổng quan

### Bố cục & hệ thống lưới tổng thể

decision:
REPLACE

motion:
N_A

user note:
""

current purpose:
Hiện tại mỗi khu vực tự định nghĩa lưới riêng (hero-grid, grid, comm-grid, rules-grid…) với khoảng cách đặt thủ công; chưa có grid system thống nhất.

technical constraints:
- Đổi lưới toàn cục có thể gây tràn ngang ở màn hình nhỏ (MEDIUM)
- Không có grid system thống nhất; redesign có thể chuẩn hoá.

source:
- crabbie-port26.html (CSS toàn cục)
- selector: .hero-grid
- selector: .grid
- selector: .comm-grid
- selector: .rules-grid
- selector: khung container chung

---

### Typography (kiểu chữ)

decision:
REPLACE

motion:
N_A

user note:
""

current purpose:
Dùng font hệ thống cộng các class tiêu đề/đoạn tự định nghĩa; màu chữ lấy từ chuỗi biến --text-*.

technical constraints:
- Chuỗi biến --text-* do appearance quản lý; đổi tên biến phải cập nhật cả preview và public.

source:
- crabbie-port26.html (CSS)
- src/appearance-core.js
- selector: body
- selector: h1–h4
- selector: .eyebrow
- selector: .signature
- function/module: setTextOverride
- function/module: planThemeVars

---

### Bảng màu / theme tokens

decision:
REPLACE

motion:
N_A

user note:
""

current purpose:
Appearance lưu token dạng hex nghiêm ngặt, có model kế thừa và 24 role override nâng cao, prune khi không còn dùng.

technical constraints:
- Ghi thẳng path hoặc materialize giá trị kế thừa gây override không xoá được; preview và public lệch nhau (MEDIUM)

source:
- src/appearance-core.js
- function/module: planThemeVars
- function/module: planAdvancedVars
- function/module: sanitizeThemeForWrite

---

### Nút & control cơ bản

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
Nút dùng chung class .btn kèm biến thể; trạng thái disabled dùng cho CTA dịch vụ đóng và nút tải asset không khả dụng.

technical constraints:
- Hiệu ứng nhấn khi bấm là mục Motion riêng, không quyết định ở đây.

source:
- crabbie-port26.html (CSS)
- selector: .btn
- selector: .nav-cta
- selector: [disabled]

---

## Global

### Điều hướng desktop (thanh menu trên)

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
Điều hướng giữa các view, tự gắn aria-current cho mục đang xem (view chi tiết ánh xạ về mục cha), hiển thị tên thương hiệu và tiêu đề SEO từ CMS, nhãn lấy từ bảng cms_navigation.

technical constraints:
- Đổi giá trị data-goto sẽ phá delegation và highlight mục đang xem (MEDIUM)

source:
- crabbie-port26.html
- src/site-content-core.js
- src/site-content-cms.js
- selector: nav#mainNav
- selector: .nav-links a[data-goto]
- selector: a.nav-cta
- function/module: NAVKEY
- function/module: applyRoute
- function/module: parseRoute
- function/module: navigate
- function/module: titleFor

---

### Menu di động (burger)

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Mở/đóng menu; tự đóng khi bấm ra ngoài, nhấn Escape hoặc đổi route; giữ focus bên trong menu khi mở.

technical constraints:
- Bỏ focus trap hoặc aria-expanded sẽ hỏng trải nghiệm người dùng bàn phím (MEDIUM)

source:
- crabbie-port26.html
- selector: button#navBurger
- selector: div#mobileMenu
- selector: .open
- selector: bên trong: a[data-goto]
- function/module: closeMenu
- function/module: focus trap
- function/module: aria-expanded

---

### Footer & khối liên hệ

decision:
REPLACE

motion:
N_A

user note:
""

current purpose:
Render danh sách liên hệ theo settings.contact.links[] (có fallback email/twitter cũ), chỉ cho phép https / mailto / anchor.

technical constraints:
- Chính sách URL an toàn là bất biến bảo mật, không phải lựa chọn thẩm mỹ.

source:
- crabbie-port26.html
- src/site-content-core.js
- selector: #footContactList
- selector: .cms-contact-link
- selector: [data-foot-fixed]
- selector: #footEmail
- selector: #footTwitter
- function/module: contactLinksSettings()

---

### Toast (thông báo tạm thời)

decision:
REPLACE

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Hiển thị thông báo tạm thời qua vùng live region role=status.

technical constraints:
- Mất role=status làm screen reader không đọc được thông báo (MEDIUM)

source:
- crabbie-port26.html
- selector: #toast[role=status]
- function/module: toast()

---

### Skip link (bỏ qua tới nội dung)

decision:
KEEP_EXACT

motion:
N_A

user note:
""

current purpose:
Hiện ra khi được focus, nhảy tới #main.

technical constraints:
- Shell mới phải giữ một cơ chế tương đương + focus target.

source:
- crabbie-port26.html
- selector: a.skip-link[href="#main"]
- selector: #main

---

### Màn hình khởi động / boot overlay

decision:
REMOVE

motion:
(chưa chọn)

user note:
""

current purpose:
Giữ html ở trạng thái cms-content-pending tới lần vẽ CMS đầu tiên, phát overlay, tránh nháy prototype và tránh 404 giả cho slug đang chờ.

technical constraints:
- Bỏ gate gây nháy prototype hoặc 404 giả (HIGH)

source:
- crabbie-port26.html
- src/site-content-cms.js
- selector: html.cms-content-pending / .cms-content-ready
- selector: #homeBloomTransition
- selector: .is-hidden
- function/module: cmsDetailPending
- function/module: cmsDetailMissing
- function/module: startupFallback404

---

### Nền trang trí / background

decision:
REMOVE

motion:
N_A

user note:
""

current purpose:
Tạo không khí nền cho site. Chuyển động của lớp nền được quyết định riêng ở nhóm Motion.

technical constraints:
- Chuyển động parallax/crossfade xem mục Motion — “Parallax / crossfade của decor”.

source:
- crabbie-port26.html (CSS)

---

## Home

### Hero trang chủ

decision:
REPLACE

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Render tiêu đề / tagline / CTA / ảnh hero từ settings và brand CMS.

technical constraints:
- Cần giữ thứ bậc heading, đích CTA (portfolio / commissions) và binding ảnh hero.

source:
- crabbie-port26.html
- src/site-content-cms.js
- selector: section.view[data-view=home]
- selector: .hero-grid
- selector: .hero-ctas
- selector: .hero-art-wrap

---

### Featured works (tác phẩm nổi bật)

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
"chỉ giữ cái thẻ thôi, còn cái thẻ tiêu đề A few little favorites thì bỏ đi. "

current purpose:
Render thẻ từ CMS, mở route chi tiết dự án khi bấm.

technical constraints:
- Thẻ không nằm trong danh sách nav-exclusion sẽ bị trễ điều hướng (MEDIUM)

source:
- crabbie-port26.html
- selector: #worksGrid
- selector: .work
- selector: [data-project]
- function/module: window.CrabbiePortfolio.apply

---

### Freebies strip (dải tài nguyên miễn phí)

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
"thêm nút download trên trên góc trái như bản thiết kế mới, chỉ là nút trang trí không tác dụng gì"

current purpose:
Render thẻ asset từ CMS, mở route chi tiết asset.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- crabbie-port26.html
- selector: #assetsGrid
- selector: .item
- selector: [data-asset]
- function/module: window.CrabbieAssets.apply

---

### Dải CTA đặt commission

decision:
REPLACE

motion:
NEW_MOTION

user note:
""

current purpose:
Hiển thị teaser tier và nút chuyển tới trang commissions.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- crabbie-port26.html
- selector: .cta
- selector: .cta-tier

---

## Portfolio

### Lưới portfolio

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Sắp xếp thẻ theo biến thể pf-l / pf-t / pf-s / pf-w, tính lại khi hydrate / lọc / resize, chống tràn ngang.

technical constraints:
- Bỏ các điểm recompute hoặc auto-placement dày sẽ phá bố cục (MEDIUM)

source:
- crabbie-port26.html
- src/portfolio-grid-core.js
- src/portfolio-cms.js
- src/portfolio-cms-core.js
- selector: #pfGrid
- selector: .is-art-ready
- selector: .is-image-card
- selector: .pf-l
- selector: .pf-t
- selector: .pf-s
- selector: .pf-w
- function/module: initFilter('pf')
- function/module: planPortfolioVariants
- function/module: syncPortfolioComposition

---

### Tìm kiếm & bộ lọc portfolio

decision:
REPLACE

motion:
N_A

user note:
""

current purpose:
Lọc deterministic theo data-cat / data-search, cập nhật trạng thái và empty state.

technical constraints:
- Giữ nguyên id để adapter rebind được.

source:
- crabbie-port26.html
- selector: #pfSearch
- selector: #pfChips
- selector: #pfStatus
- selector: #pfEmpty
- function/module: initFilter('pf')

---

### Thẻ dự án (project card)

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Hiển thị ảnh / tiêu đề, mở chi tiết dự án khi bấm.

technical constraints:
- Phải nằm trong danh sách nav-exclusion để điều hướng tức thời.

source:
- selector: .work
- selector: [data-project]
- selector: .is-art-ready

---

### Trạng thái rỗng của portfolio

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
Hiện #pfEmpty khi không có thẻ nào khớp bộ lọc.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- selector: #pfEmpty
- selector: #pfStatus

---

## Project Detail

### Bố cục trang chi tiết dự án

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Render dự án từ CMS; vào trang ở trạng thái tĩnh (stationary) để tránh nháy; trở về danh sách giữ vị trí cuộn.

technical constraints:
- Bỏ sót loại block sẽ mất nội dung CMS (MEDIUM)

source:
- crabbie-port26.html
- src/portfolio-cms.js
- selector: section[data-view=project-detail]
- selector: #pdTitle
- selector: #pdDesc
- selector: #pdCover[data-cover-viewer]
- selector: #pdBlocks
- selector: #pdPrev
- selector: #pdNext
- function/module: renderProject
- function/module: publicBlockBody

---

### Trình bày credits (ê-kíp)

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
Render theo thứ tự từ bảng junction qua people-cms; nhãn lấy từ content.peopleCreditLabel.

technical constraints:
- Junction chỉ lưu tham chiếu, không copy dữ liệu người.

source:
- src/people-cms.js
- selector: #pdCreditStrip

---

### Các khối nội dung / media

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
publicBlockBody xử lý mọi loại block do CMS trả về.

technical constraints:
- Thiếu một loại block = mất nội dung CMS (MEDIUM)

source:
- selector: #pdBlocks
- function/module: publicBlockBody

---

### Điều hướng trước / sau

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
Điều hướng ngay lập tức sang dự án anh em.

technical constraints:
- Phải nằm trong nav-exclusion.

source:
- selector: #pdPrev
- selector: #pdNext

---

## Free Assets

### Bố cục danh sách free assets

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Hiển thị lưới asset kèm tìm kiếm và bộ lọc.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- src/free-assets-cms.js
- src/free-assets-core.js
- selector: #faGrid
- function/module: initFilter('fa')
- function/module: mapFreeAsset

---

### Tìm kiếm & bộ lọc free assets

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
Lọc theo danh mục chuẩn hoá từ mapFreeAsset.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- selector: #faSearch
- selector: #faChips
- selector: #faStatus
- selector: #faEmpty

---

### Thẻ asset

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
Mở chi tiết asset theo data-asset.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- selector: .item
- selector: [data-asset]

---

### Trang chi tiết asset

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
renderAsset dựng phần thông số / license, gallery và trạng thái tải.

technical constraints:
- Đổi cấu trúc DOM phải cập nhật adapter tương ứng.

source:
- crabbie-port26.html
- function/module: renderAsset

---

### Khu vực tải xuống

decision:
KEEP_EXACT

motion:
N_A

user note:
""

current purpose:
Chỉ cho tải khi asset available và có URL; nếu không thì disable kèm lý do.

technical constraints:
- Bật tải khi thiếu URL vi phạm tính trung thực của sản phẩm (HIGH)

source:
- selector: #adDownload
- selector: #adDriveDownload
- selector: #adUnavailable
- function/module: isAssetAvailable

---

### Gallery ảnh của asset

decision:
KEEP_EXACT

motion:
N_A

user note:
""

current purpose:
Dựng gallery theo metadata.gallery[] có thứ tự, mở trong viewer dùng chung.

technical constraints:
- Cover-first order phải giữ.

source:
- src/asset-gallery-core.js
- selector: #adGallery
- selector: #adGalleryMore
- selector: [data-ad-index]

---

## Commissions

### Thẻ gói dịch vụ (tier cards)

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Render giá và availability; CTA bị disable kèm lý do khi dịch vụ đóng.

technical constraints:
- Hỏng mapping data-form sẽ gửi yêu cầu sang sai tab (MEDIUM)

source:
- src/commissions-cms.js
- src/commissions-core.js
- selector: .comm-grid
- selector: [data-service][data-form][data-service-slug]

---

### Accordion chi tiết dịch vụ

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Mở / đóng với semantics accordion đúng chuẩn.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- selector: .acc

---

### Dịch vụ khác (other services)

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Map OTHER_SERVICES, hiện chi tiết trong #otherServiceDetail (aria-live).

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- selector: #miniServicesGrid[data-other-service]
- selector: #otherServiceDetail[aria-live]

---

### Hiển thị phí & điều khoản

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
Hiển thị nội dung phí và điều khoản đi kèm.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- selector: .rules-grid

---

### Client thanks (lời cảm ơn khách hàng)

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Render từ people CMS; tự chọn chế độ theo ngưỡng số lượng; có nút tạm dừng; bản sao clone được aria-hidden và không nhận focus.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- src/people-cms.js
- selector: #clientThanks
- function/module: renderClientThanks
- function/module: ThanksMotion

---

### Form gửi yêu cầu commission

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
Tab role=tab với roving tabindex, Arrow / Home / End; panel chuyển theo class .on.

technical constraints:
- Hỏng tab semantics làm mất khả năng dùng bàn phím (MEDIUM)

source:
- selector: .tab-btn[role=tab]
- selector: .tab-panel
- selector: .on

---

### Màn hình kết quả / thành công

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Chỉ hiện thành công sau khi insert được xác nhận; kèm toast và confetti; khi lỗi hiển thị thông báo chung và giữ lại bản nháp.

technical constraints:
- Bỏ gate xác nhận gây trùng lặp hoặc báo thành công giả (HIGH)

source:
- src/commission-requests.js
- src/commission-requests-core.js
- selector: #briefResult
- selector: #briefText
- selector: #briefEmail
- selector: #commissionSubmit[aria-busy]
- function/module: setFormState
- function/module: isConfirmedCommissionSubmission
- function/module: isCommissionSubmitting

---

## About

### Trang About

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
Render từ aboutPublicModel trong site-content-core, dữ liệu bảng cms_pages.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- src/site-content-core.js
- function/module: aboutPublicModel

---

## Contact

### Trang Contact

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
Render hàng liên hệ / action theo contactLinksSettings; chỉ cho phép https / mailto / anchor.

technical constraints:
- Cùng nhà cung cấp dữ liệu với footer.

source:
- src/site-content-core.js
- selector: #publicContactRows .cms-contact-row
- selector: #publicContactActions
- selector: #copyEmailBtn

---

## Terms

### Trang Terms

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
details.tos-disclosure, [data-jump], scrollspy gắn aria-current và rebind sau khi CMS hydrate.

technical constraints:
- Scrollspy phải rebind sau khi CMS hydrate, nếu không sẽ mất chỉ báo mục đang xem.

source:
- selector: details.tos-disclosure
- selector: [data-jump]

---

## 404 / Loading

### Trang 404

decision:
REPLACE

motion:
N_A

user note:
""

current purpose:
Được vào từ cmsDetailMissing / startupFallback404; có focus target và đích phục hồi.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- selector: [data-view=404]
- selector: .v404-num

---

### Trang loading (chờ CMS)

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Tránh 404 giả khi chi tiết còn đang tải.

technical constraints:
- Bỏ view này gây 404 giả cho slug đang chờ (HIGH)

source:
- selector: [data-view=loading]
- function/module: cmsDetailPending

---

## Viewer / Lightbox

### Khung viewer (chrome)

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
syncViewerChrome / paintViewerItem vẽ chrome; stage giữ ảnh không bị control che.

technical constraints:
- Restyle đẩy ảnh xuống dưới control; bỏ hidden collapsing phá tính toán stage (MEDIUM)

source:
- crabbie-port26.html
- selector: #publicLightbox*
- selector: thuộc tính hidden
- function/module: syncViewerChrome
- function/module: paintViewerItem

---

### Điều khiển viewer

decision:
KEEP_EXACT

motion:
N_A

user note:
""

current purpose:
Zoom 1–4x, pan có biên, kéo / pinch trực tiếp không nội suy, bước chuyển có animation.

technical constraints:
- Race khi tải ảnh, trôi scroll trang, lệch focus khi teardown (HIGH)

source:
- src/lightbox-gesture-core.js
- src/lightbox-gesture.js
- function/module: openViewerCollection
- function/module: loadViewerIndex
- function/module: stepViewer
- function/module: teardownViewerUI

---

## Global Features

### Trình phát nhạc

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
Một audio ổn định, resume theo gesture, lưu volume / mute, ẩn khi ở Admin hoặc khi focus vào field nhập.

technical constraints:
- Đây là mục duy nhất LEGACY-MAP đánh dấu logic KEEP EXACT.

source:
- src/site-motion.js

---

### Pet desktop

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Giới hạn số lượng theo FIFO, click / kéo / đi lang thang / đối thoại, tránh vùng field nhập, có giới hạn riêng cho mobile.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- (không có tham chiếu kỹ thuật riêng)

---

### Kẹo rơi (falling candy)

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Spawn theo mật độ và kích thước viewport, có gate theo thiết bị và reduced-motion.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- (không có tham chiếu kỹ thuật riêng)

---

## Motion / Animation

### Jelly / hiệu ứng nhấn

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Delegation theo JELLY_TARGETS, bỏ qua control điều hướng và bỏ qua ở Admin / reduced-motion.

technical constraints:
- Pet dùng biến thể inner-body để tránh xung đột transform.

source:
- crabbie-port26.html
- src/site-motion.js
- function/module: JELLY_TARGETS
- function/module: isNavigatingControl
- function/module: JELLY_MS
- function/module: __jellyRunning

---

### Hover lift / wobble trên thẻ

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Hiệu ứng nhấc / lắc khi hover trên thẻ và nút.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- (không có tham chiếu kỹ thuật riêng)

---

### Chuyển động nền hero

decision:
REMOVE

motion:
(chưa chọn)

user note:
""

current purpose:
Lớp nền hero chuyển động nhẹ tạo không khí.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- (không có tham chiếu kỹ thuật riêng)

---

### Chuyển động vào trang

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Phát hiệu ứng khi điều hướng mới; bị triệt tiêu khi khôi phục vị trí hoặc vào trang chi tiết tĩnh.

technical constraints:
- Hợp đồng triệt tiêu (is-restoring, .is-restored-activation, stationary detail) phải giữ nguyên — đây là bất biến, không phải lựa chọn thẩm mỹ.

source:
- (không có tham chiếu kỹ thuật riêng)

---

### Sparkle burst

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Hiệu ứng trang trí tại một số điểm tương tác.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- (không có tham chiếu kỹ thuật riêng)

---

### Confetti

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Bắn confetti tại các điểm thành công.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- (không có tham chiếu kỹ thuật riêng)

---

### Flower sway / bow pop

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Chuyển động trang trí của các chi tiết hoa / nơ.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- (không có tham chiếu kỹ thuật riêng)

---

### Thanks marquee

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Tự chọn chế độ theo ngưỡng số lượng; lưu trạng thái tạm dừng; clone aria-hidden và không nhận focus.

technical constraints:
- Ngưỡng chế độ, tốc độ và quy tắc clone / focus là hợp đồng, không phải lựa chọn thẩm mỹ.

source:
- function/module: ThanksMotion

---

### Parallax / crossfade của decor

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Chia parallax / float, prefetch theo margin, gate theo thiết bị thô, reduced-motion và Admin.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- (không có tham chiếu kỹ thuật riêng)

---

### Zoom transition của viewer

decision:
KEEP_EXACT

motion:
KEEP_EXISTING_MOTION

user note:
""

current purpose:
Bước chuyển rời dùng class .anim-zoom; thao tác kéo / pinch trực tiếp không nội suy.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- selector: .anim-zoom

---

### Loading animation

decision:
REMOVE

motion:
(chưa chọn)

user note:
""

current purpose:
Hoạt ảnh hiển thị trong lúc chờ dữ liệu hoặc chờ ảnh.

technical constraints:
- Không có ràng buộc kỹ thuật bổ sung được ghi nhận.

source:
- (không có tham chiếu kỹ thuật riêng)

---

## Admin

### Giao diện Admin

decision:
KEEP_BEHAVIOR_REDESIGN_VISUAL

motion:
N_A

user note:
""

current purpose:
Máy móc lưu / auth / hydration phải giữ nguyên; chỉ phần nhìn có thể thay.

technical constraints:
- LEGACY-MAP mặc định Admin giữ nguyên chức năng bất kể quyết định về hình thức.

source:
- crabbie-port26.html
- src/admin-crud.js
- src/admin-media*.js
- src/admin-cleanup.js
- src/appearance-core.js
- selector: #adminSidebar
- selector: #adminBurger
- selector: #adminSaveStatus
- selector: #adminTopSave
- selector: #adminContent

---

## Motion Decisions

| Item | Section | Decision |
|---|---|---|
| Menu di động (burger) | Global | KEEP_EXISTING_MOTION |
| Toast (thông báo tạm thời) | Global | KEEP_EXISTING_MOTION |
| Màn hình khởi động / boot overlay | Global | (chưa chọn) |
| Hero trang chủ | Home | KEEP_EXISTING_MOTION |
| Featured works (tác phẩm nổi bật) | Home | KEEP_EXISTING_MOTION |
| Freebies strip (dải tài nguyên miễn phí) | Home | KEEP_EXISTING_MOTION |
| Dải CTA đặt commission | Home | NEW_MOTION |
| Lưới portfolio | Portfolio | KEEP_EXISTING_MOTION |
| Thẻ dự án (project card) | Portfolio | KEEP_EXISTING_MOTION |
| Bố cục trang chi tiết dự án | Project Detail | KEEP_EXISTING_MOTION |
| Bố cục danh sách free assets | Free Assets | KEEP_EXISTING_MOTION |
| Thẻ asset | Free Assets | KEEP_EXISTING_MOTION |
| Thẻ gói dịch vụ (tier cards) | Commissions | KEEP_EXISTING_MOTION |
| Accordion chi tiết dịch vụ | Commissions | KEEP_EXISTING_MOTION |
| Dịch vụ khác (other services) | Commissions | KEEP_EXISTING_MOTION |
| Client thanks (lời cảm ơn khách hàng) | Commissions | KEEP_EXISTING_MOTION |
| Màn hình kết quả / thành công | Commissions | KEEP_EXISTING_MOTION |
| Trang loading (chờ CMS) | 404 / Loading | KEEP_EXISTING_MOTION |
| Khung viewer (chrome) | Viewer / Lightbox | KEEP_EXISTING_MOTION |
| Pet desktop | Global Features | KEEP_EXISTING_MOTION |
| Kẹo rơi (falling candy) | Global Features | KEEP_EXISTING_MOTION |
| Jelly / hiệu ứng nhấn | Motion / Animation | KEEP_EXISTING_MOTION |
| Hover lift / wobble trên thẻ | Motion / Animation | KEEP_EXISTING_MOTION |
| Chuyển động nền hero | Motion / Animation | (chưa chọn) |
| Chuyển động vào trang | Motion / Animation | KEEP_EXISTING_MOTION |
| Sparkle burst | Motion / Animation | KEEP_EXISTING_MOTION |
| Confetti | Motion / Animation | KEEP_EXISTING_MOTION |
| Flower sway / bow pop | Motion / Animation | KEEP_EXISTING_MOTION |
| Thanks marquee | Motion / Animation | KEEP_EXISTING_MOTION |
| Parallax / crossfade của decor | Motion / Animation | KEEP_EXISTING_MOTION |
| Zoom transition của viewer | Motion / Animation | KEEP_EXISTING_MOTION |
| Loading animation | Motion / Animation | (chưa chọn) |

## Removed Features

- Global — Màn hình khởi động / boot overlay
- Global — Nền trang trí / background
- Motion / Animation — Chuyển động nền hero
- Motion / Animation — Loading animation

## Deferred / Unsure Decisions

Không có mục nào còn treo.

## Technical Invariants

### Điều hướng hash & áp route

status:
PRESERVE_GUARANTEE

guarantee:
parseRoute / routeFromLocation / navigate / applyRoute / handleHash chạy đúng; có echo-dedup qua lastAppliedHash; teardown trước khi apply; có fallback 404 và dashboard.

why it matters:
Mọi thay đổi màn hình đều đi qua đây. Sai sẽ gây double-apply view hoặc kẹt lịch sử.

what visual may still change:
Toàn bộ giao diện thanh menu, nút và các trang đều được vẽ lại tự do.

existing source:
- crabbie-port26.html: parseRoute, routeFromLocation, navigate, applyRoute, handleHash, titleFor, SIMPLE_VIEWS, ADMIN_MODULES, NAVKEY, lastAppliedHash

---

### Back / Forward & quyền sở hữu history của viewer

status:
PRESERVE_GUARANTEE

guarantee:
Back đóng viewer trước; tối đa một entry {crabbieViewer:true}; các bước chuyển ảnh không đẩy thêm entry; teardown không khôi phục nhầm.

why it matters:
Nếu sai, người dùng bị kẹt trong viewer hoặc Back nhảy cóc qua nhiều route.

what visual may still change:
Màu sắc, icon và bố cục của viewer và nút Back.

existing source:
- popstate capture, viewerOwnedEntry / viewerStaleSkip / viewerScrollY, closePublicLightbox, teardownViewerForRoute

---

### Khôi phục vị trí cuộn

status:
PRESERVE_GUARANTEE

guarantee:
Quyết định keep / restore / top tất định; chỉ dùng instantScrollTo (không bao giờ smooth); clamp scroll; giữ nguyên khi cùng route.

why it matters:
Smooth scroll gây lỗi bò lên đầu trang; focus kèm scroll phá vị trí khôi phục.

what visual may still change:
Hiệu ứng vào trang khi điều hướng mới.

existing source:
- src/route-scroll-core.js (sameRoute, isDetailReturn, clampScrollY, decideScroll)
- scrollMemory theo view
- body.is-restoring

---

### Trở về từ chi tiết giữ đúng vị trí danh sách

status:
PRESERVE_GUARANTEE

guarantee:
isDetailReturn cùng class .is-restored-activation giữ trạng thái tĩnh khi quay lại danh sách.

why it matters:
Người dùng đang đọc giữa danh sách; nhảy về đầu trang là mất ngữ cảnh.

what visual may still change:
Trang trí của hiệu ứng khi điều hướng mới.

existing source:
- src/route-scroll-core.js
- .view.is-restored-activation (CSS)

---

### Focus trap & trả focus về opener

status:
PRESERVE_GUARANTEE

guarantee:
Mobile menu và viewer giữ focus bên trong; khi đóng thì trả focus về phần tử đã mở.

why it matters:
Người dùng bàn phím và screen reader sẽ bị lạc nếu trap hoặc restore bị bỏ.

what visual may still change:
Kiểu dáng nút và màu focus ring.

existing source:
- closeMenu (mobile menu trap)
- focus trap của viewer
- focusView

---

### Giới hạn zoom / pan của viewer

status:
PRESERVE_GUARANTEE

guarantee:
Zoom kẹp trong khoảng 1–4x, pan có biên theo kích thước ảnh, re-clamp khi resize; kéo / pinch trực tiếp không nội suy.

why it matters:
Ảnh bị đẩy ra ngoài khung hoặc giật khi thao tác.

what visual may still change:
Thanh zoom, icon, màu sắc.

existing source:
- src/lightbox-gesture-core.js (window.CrabbieLightboxGesture)
- src/lightbox-gesture.js

---

### CMS refresh sau khi Admin lưu

status:
PRESERVE_GUARANTEE

guarantee:
Sau khi lưu, refreshPublicCms(scope) chạy đúng 13 scope trong 5 nhóm; adapter vẽ lại đúng container.

why it matters:
Lưu thành công nhưng trang public vẫn hiển thị dữ liệu cũ là lỗi niềm tin.

what visual may still change:
Markup của renderer, miễn là id / selector hợp đồng được giữ hoặc cập nhật cùng adapter.

existing source:
- src/public-cms-refresh.js
- src/portfolio-cms.js, people-cms.js, free-assets-cms.js, commissions-cms.js, site-content-cms.js

---

### Bảo vệ bản nháp (dirty draft)

status:
PRESERVE_GUARANTEE

guarantee:
canMutateAdmin / shouldBlockAdminExit / shouldSetBeforeUnload chặn rời trang khi còn thay đổi chưa lưu.

why it matters:
Mất bản nháp đang soạn là mất công việc.

existing source:
- src/admin-draft-guard*.js

---

### Chống xung đột khi lưu

status:
PRESERVE_GUARANTEE

guarantee:
Định danh UUID, guard updated_at, zero-row = stale_save, single-flight, revision gate, baseline chỉ tiến khi đã xác nhận; cấm upsert theo slug.

why it matters:
Nếu thiếu, hai tab có thể ghi đè lên nhau một cách im lặng.

what visual may still change:
Toàn bộ phần nhìn của các panel Admin.

existing source:
- src/admin-record-save-core.js
- src/admin-save-flight-core.js
- src/admin-save-revision-core.js
- src/admin-persisted-baseline-core.js
- src/admin-hydration-core.js

---

### Supabase auth / RLS

status:
PRESERVE_GUARANTEE

guarantee:
Chỉ app_metadata.role === 'admin' mới vào được Admin; public chỉ đọc bản published; visitor chỉ insert có ràng buộc; client chỉ dùng public key.

why it matters:
Sai sẽ lộ dữ liệu hoặc mở đường leo thang quyền.

what visual may still change:
Trang đăng nhập và shell Admin.

existing source:
- src/admin-auth-core.js
- src/admin-auth.js
- src/admin-auth-events-core.js
- supabase/migrations/*.sql
- api/public-config.js

---

### Commission chỉ báo thành công sau khi insert được xác nhận

status:
PRESERVE_GUARANTEE

guarantee:
Single-flight + busy lock + chỉ hiện thành công khi isConfirmedCommissionSubmission; lỗi public không lộ text DB thô.

why it matters:
Tránh gửi trùng và tránh báo thành công giả.

what visual may still change:
Bố cục form, kiểu nút, màn hình kết quả.

existing source:
- src/commission-requests.js
- src/commission-requests-core.js

---

### An toàn xóa media & purge

status:
PRESERVE_GUARANTEE

guarantee:
Xóa nhiều bước có thể phục hồi, kiểm tra usage, re-check mới, gate grace / scan / lease, purge thủ công có xác nhận, audit log append-only.

why it matters:
Xóa một bước có thể phá ảnh đang được dùng trên trang public.

what visual may still change:
Giao diện thư viện media và panel cleanup.

existing source:
- src/admin-media-safety-core.js
- src/media-purge-core.js
- src/media-cleanup-scanner-core.js
- migrations cho tombstone / cleanup / lease

---

### Tính trung thực của nút tải asset

status:
PRESERVE_GUARANTEE

guarantee:
Chỉ cho tải khi asset available và có URL; nếu không thì disable kèm lý do.

why it matters:
Nút tải chết làm mất niềm tin của người dùng.

what visual may still change:
Kiểu dáng nút và banner thông báo.

existing source:
- isAssetAvailable
- renderAsset (gating)

---

### Accessibility semantics

status:
PRESERVE_GUARANTEE

guarantee:
ARIA pressed / expanded / selected / current / busy / disabled / hidden / modal, live region, labelledby / describedby, bản đồ phím, skip link.

why it matters:
Người dùng bàn phím và screen reader phụ thuộc hoàn toàn vào các thuộc tính này.

what visual may still change:
Mọi thứ nhìn thấy, miễn là thuộc tính và hành vi bàn phím còn nguyên.

existing source:
- crabbie-port26.html
- §21 LEGACY-MAP

---

### Hỗ trợ reduced-motion

status:
PRESERVE_GUARANTEE

guarantee:
CSS kill + gate JS + theo dõi matchMedia trực tiếp cho candy / pet / decor / thanks / boot / scroll.

why it matters:
Người dùng bị rối loạn tiền đình cần tắt chuyển động.

what visual may still change:
Mọi chuyển động mới, miễn là vẫn tôn trọng prefers-reduced-motion.

existing source:
- §20, §21 LEGACY-MAP

---

### Điều hướng tức thời & nav-exclusion

status:
PRESERVE_GUARANTEE

guarantee:
Mọi control điều hướng phản hồi ngay lập tức; danh sách delegation và danh sách loại trừ phải khớp nhau.

why it matters:
Thẻ mới nằm ngoài danh sách loại trừ sẽ bị trễ điều hướng.

what visual may still change:
Hình thức của thẻ và nút.

existing source:
- isNavigatingControl
- delegated click map
- CSS kill-switch

---

### Bảo mật server API

status:
PRESERVE_GUARANTEE

guarantee:
Chỉ trả public key; proxy oEmbed ghim host và làm sạch field.

why it matters:
Tránh lộ secret và tránh lỗ hổng SSRF.

what visual may still change:
Không liên quan tới giao diện.

existing source:
- api/public-config.js
- api/tiktok-oembed.js
- tiktokVideoId gate

---

### Token appearance & var chain

status:
PRESERVE_GUARANTEE

guarantee:
Đường dẫn token, ngữ nghĩa kế thừa, prune-on-absent, chuỗi --text-* gắn trên body.

why it matters:
Ghi thẳng path hoặc materialize giá trị kế thừa tạo override không xoá được; preview và public sẽ lệch nhau.

what visual may still change:
Toàn bộ control trong Settings / Appearance.

existing source:
- src/appearance-core.js
- refreshAppearancePreview
- settings.theme.*, settings.textOverrides

---

### Media upload pipeline

status:
PRESERVE_GUARANTEE

guarantee:
Upload chia nhỏ có kiểm tra (≤ 6MB chuẩn / TUS có fallback), dedupe SHA-256, lease coordination, retry / backoff.

why it matters:
Upload hỏng hoặc trùng lặp làm hỏng thư viện media.

existing source:
- src/admin-upload-core.js
- src/admin-media-upload.js
- src/media-upload-leases.js

---

### People junction chỉ ghi qua RPC

status:
PRESERVE_GUARANTEE

guarantee:
save_project_with_people / move_person là đường ghi duy nhất; junction lưu tham chiếu, không copy dữ liệu người.

why it matters:
Copy dữ liệu người gây credit sai và lỗi thời.

what visual may still change:
Cách trình bày credit strip và client thanks.

existing source:
- supabase RPCs: save_project_with_people, move_person
- src/admin-crud.js

---

## Final Instruction For Future Agents

These decisions belong to the USER.

Do not override explicit user decisions using old classifications from LEGACY-MAP.md.

Technical invariants define functional guarantees, not required visual implementation.
