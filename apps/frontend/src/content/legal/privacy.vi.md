---
title: Thông báo về quyền riêng tư
updated: 2026-08-27
language: vi
---

# Thông báo về quyền riêng tư

Trang này cho biết Content Factory (factory.aidevteam.ru) thu thập dữ liệu cá
nhân nào, vì sao cần đến chúng, còn ai khác nhìn thấy chúng và làm thế nào để xóa
bỏ chúng. Trang ngắn vì dữ liệu không nhiều.

## 1. Ai chịu trách nhiệm và liên hệ bằng cách nào

Bên xử lý dữ liệu cá nhân là OOO «МЕГАКАМПУС» (LLC MEGAKAMPUS), OGRN
1107746107204, INN 7719743262, địa chỉ: 105318, Moskva, ul. Izmaylovskiy val 2,
tầng 3, khu I, phòng 12G, Liên bang Nga. Bên xử lý quyết định vì sao và bằng cách
nào dữ liệu cá nhân được xử lý trong Content Factory tại factory.aidevteam.ru, và
chịu trách nhiệm về việc xử lý đó.

Kênh nhanh nhất là bot Telegram [@content_factory_adtbot](https://t.me/content_factory_adtbot); cũng chính bot này là kênh hỗ trợ. Yêu cầu
chính thức về quyền của bạn xin gửi tới info@megacampus.com hoặc gửi thư tới địa
chỉ nêu trên. Yêu cầu về việc dữ liệu của bạn có được xử lý hay không sẽ được trả
lời trong vòng 10 ngày làm việc kể từ khi nhận; thời hạn này có thể kéo dài thêm
tối đa 5 ngày làm việc, và chúng tôi sẽ nêu lý do.

## 2. Những gì được thu thập

### 2.1 Đăng ký và tài khoản

Khi bạn tạo tài khoản, những thông tin sau được lưu:

- địa chỉ email của bạn;
- mật khẩu của bạn — không phải bản thân mật khẩu, mà là một mã băm bcrypt của
  nó. Không thể khôi phục mật khẩu từ mã băm, và chúng tôi không biết mật khẩu;
- cách bạn đăng nhập: bằng mật khẩu, hoặc bằng một dịch vụ bên ngoài như
  Telegram cùng với định danh mà dịch vụ đó cấp;
- địa chỉ IP và chuỗi User-Agent của trình duyệt được ghi nhận tại thời điểm
  đăng ký;
- tên không gian làm việc, nếu bạn có đặt;
- một múi giờ;
- ghi nhận rằng bạn đã đồng ý nhận bản tin, và vào lúc nào, nếu bạn đã đánh dấu
  vào ô đó.

Về sau bạn có thể thêm tên, họ, một mô tả ngắn và một ảnh đại diện. Không có mục
nào trong số đó là bắt buộc.

Việc đăng ký là mở, nhưng một tài khoản mới không hoạt động cho đến khi quản trị
viên phê duyệt. Trước khi được phê duyệt, tài khoản tồn tại và không làm được gì:
không phiên đăng nhập nào được cấp, không email kích hoạt nào được gửi, và mọi
yêu cầu API đều bị từ chối.

### 2.2 Sử dụng dịch vụ

Trong lúc bạn dùng dịch vụ, cơ sở dữ liệu giữ những gì bạn đưa vào đó: nội dung
bài đăng, tệp đã tải lên, lịch xuất bản, bình luận, cài đặt. Nếu bạn kết nối một
kênh mạng xã hội, token truy cập mà mạng đó cấp cũng được lưu — không có nó, dịch
vụ không thể xuất bản thay cho bạn. Khóa của nhà cung cấp AI, nếu bạn nhập, được
lưu ở dạng mã hóa.

Có một nhật ký riêng về việc sử dụng AI. Nó chỉ ghi lại thao tác nào đã được phép
chạy: tổ chức, chế độ, tên thao tác, nhà cung cấp, mô hình và kết quả xét duyệt.
Không có prompt, không có nội dung bài đăng và không có đầu ra của mô hình nào đi
vào đó.

Để phân biệt văn bản của bạn với văn bản do máy viết, dịch vụ so sánh nó với
văn bản của những tác giả khác đang làm việc trong dịch vụ. Việc này do một tác
vụ phía máy chủ thực hiện: nó đọc những văn bản đó, tính ra các con số và chỉ
đưa ra bên ngoài các con số — một phân bố điểm và hai ngưỡng. Không một câu nào
của người khác lọt vào không gian làm việc của bạn: không lên màn hình, không
vào lời nhắc cho mô hình, không vào nhật ký. Văn bản của bạn cũng tham gia vào
chính phép so sánh đó cho những tác giả khác.

Khi dịch vụ đề xuất một bản nháp và bạn gửi bản của mình, cặp đó được lưu: điều
mô hình đề xuất và điều bạn đã gửi. Việc này để phép kiểm tra độ giống học cách
phân biệt văn bản máy với văn bản của bạn. Cặp đó tồn tại chừng nào còn avatar
mà nó được thu thập cho: xoá avatar thì các sửa đổi bị xoá cùng.

### 2.3 Các trang công khai và bản demo

Các trang công khai và bản demo sản phẩm đếm xem mọi việc xảy ra bao nhiêu lần.
Đúng năm trường được gửi đi:

- tên sự kiện — một trong bốn: đã xem trang giới thiệu, đã bắt đầu demo, đã kết
  thúc demo, đã bắt đầu đăng ký;
- ngôn ngữ của trang — `ru` hoặc `en`;
- một nhóm độ rộng cửa sổ — một trong bốn từ, không bao giờ là kích thước thật;
- một phiên bản giao diện;
- một bước của bản demo.

Không có gì khác. Không địa chỉ IP, không User-Agent, không trang dẫn nguồn,
không cookie, không định danh khách truy cập, không địa chỉ email. Tất cả được
cộng vào các bộ đếm theo ngày: mỗi ngày và mỗi bộ giá trị là một dòng, chứa một
con số. Không có gì trong dữ liệu đó cho phép phân biệt khách truy cập này với
khách truy cập khác.

Hai sự kiện nữa — một lượt đăng ký hoàn tất và một lượt kích hoạt không gian làm
việc — do chính máy chủ ghi lại. Nó lưu một biên nhận: tên sự kiện và kết quả của
một phép biến đổi mật mã một chiều. Biên nhận tồn tại để cùng một sự kiện không
bị đếm hai lần. Nó không mang địa chỉ, không mang tên và không mang IP.

Để không ai làm ngập các bộ đếm, có một giới hạn tần suất. Nó đếm số yêu cầu theo
một khóa tạm thời được tạo ra từ địa chỉ IP bằng một phép biến đổi một chiều với
một khóa ngẫu nhiên. Khóa đó sống một phút và chỉ nằm trong bộ nhớ của tiến trình
đang chạy. Bản thân địa chỉ IP không bao giờ được ghi lại.

### 2.4 Cookie

Những cookie mà dịch vụ này đặt:

- `auth` — phiên đăng nhập của bạn. Xuất hiện sau khi bạn đăng nhập, tồn tại tối
  đa một năm. Không có nó thì đăng nhập không hoạt động;
- `showorg` — mở không gian làm việc nào. Xuất hiện khi có nhiều hơn một;
- `org` — lời mời vào không gian làm việc của người khác. Sống 15 phút;
- `oauth_state` — một phép kiểm tra ngắn rằng lượt đăng nhập qua dịch vụ bên
  ngoài đã quay lại đúng trình duyệt đã khởi đầu nó. Sống 5 phút;
- `i18next` — ngôn ngữ giao diện bạn đã chọn.

Không có cookie quảng cáo. Không có cookie phân tích của bên thứ ba. Không cookie
nào ở trên theo bạn sang các trang khác.

### 2.5 Báo cáo lỗi

Khi có gì đó hỏng, dịch vụ gửi một báo cáo lỗi đến bộ thu thập của chính nó, chạy
trên cùng máy chủ. Báo cáo chứa một định danh sự kiện, thời gian, một mức độ, môi
trường, phiên bản bản dựng, tên dịch vụ, loại lỗi và các khung ngăn xếp — đường
dẫn tệp tính từ gốc kho mã, tên hàm, dòng và cột.

Không người dùng, không yêu cầu, không tiêu đề, không cookie, không địa chỉ IP,
không User-Agent và không một chữ nào bạn đang viết. Sự kiện được dựng lại từ một
danh sách trường được phép, chứ không phải chuyển tiếp nguyên trạng.

### 2.6 Những gì sản phẩm này không có

Điều này đáng nói thẳng ra, vì nó không thường gặp. Sản phẩm hoàn toàn không mang
theo công cụ phân tích sản phẩm của bên thứ ba nào. PostHog, Plausible, Google
Tag Manager, dub, datafa.st, pixel của Facebook, Sentry dạng dịch vụ và tiện ích
trò chuyện Chatbase đều đã được gỡ bỏ cùng các phụ thuộc của chúng, và việc đưa
bất kỳ thứ nào trong đó trở lại sẽ làm hỏng một bước kiểm tra tự động. Các trang
đang chạy không tải một script bên ngoài nào. Phông chữ được phục vụ từ máy chủ
của chúng tôi, không phải từ một CDN phông chữ.

Không có việc lập hồ sơ hành vi. Không có quyết định tự động nào về bạn dựa trên
dữ liệu của bạn. Dữ liệu của bạn không bị bán.

## 3. Vì sao dữ liệu này được dùng

- Địa chỉ và mật khẩu — để bạn có thể đăng nhập và để chúng tôi phân biệt được
  tài khoản của bạn với của người khác.
- Địa chỉ IP và User-Agent lúc đăng ký — để đối phó với việc lạm dụng đăng ký và
  dò mật khẩu.
- Nội dung không gian làm việc — để dịch vụ làm đúng việc bạn tìm đến nó.
- Token của các kênh đã kết nối — để đăng bài ở nơi bạn đã chỉ định.
- Bộ đếm của các trang công khai — để biết sản phẩm có chạy được không, mà không
  cần theo dõi con người.
- Báo cáo lỗi — để sửa những gì hỏng.
- Địa chỉ dùng cho bản tin — chỉ khi bạn đã đánh dấu vào ô đó.

Gần như mọi thứ ở trên được xử lý vì chúng cần thiết để cung cấp đúng điều bạn
yêu cầu khi tạo tài khoản. Bản tin thì khác: nó dựa trên sự đồng ý của bạn, và
bạn có thể rút lại sự đồng ý đó bất cứ lúc nào.

## 4. Còn ai khác nhận dữ liệu

Danh sách đầy đủ các bên nhận, và những gì đến với từng bên, nằm trong một tài
liệu riêng, “Bên nhận dữ liệu”. Nói ngắn gọn:

- dịch vụ gửi thư Resend nhận địa chỉ người nhận, tiêu đề và nội dung của một
  email dịch vụ: kích hoạt tài khoản, đặt lại mật khẩu, xác nhận địa chỉ. Không
  có nội dung bài đăng và không có token nền tảng nào;
- hệ thống bản tin Listmonk chạy trên máy chủ của chính chúng tôi và chỉ nhận
  địa chỉ của bạn sau khi có sự đồng ý rõ ràng. Nó không rời khỏi máy chủ;
- bộ thu thập lỗi của chính chúng tôi, trên máy chủ của chính chúng tôi, nhận
  những gì mục 2.5 mô tả;
- Telegram tham gia nếu bạn đăng nhập qua Telegram;
- OpenAI, OpenRouter và Tavily nhận prompt, nội dung bài đăng và truy vấn tìm
  kiếm — nhưng chỉ khi một không gian làm việc tự cấu hình AI. Khóa của tổ chức
  này không bao giờ được dùng cho tổ chức khác;
- API của các mạng xã hội nhận nội dung bài đăng và tệp — khi bạn đã kết nối một
  kênh và yêu cầu xuất bản;
- một địa chỉ do bạn chọn nhận trọn vẹn một bài đăng, nếu bạn thiết lập một
  webhook trỏ đến đó.

Dữ liệu chỉ đến cơ quan nhà nước ở những nơi luật pháp yêu cầu.

Chúng tôi không bán dữ liệu và không trao dữ liệu cho các nhà quảng cáo.

## 5. Dữ liệu được xử lý ở đâu

Máy chủ đặt tại Hà Lan. Cơ sở dữ liệu, các tệp, hệ thống bản tin và bộ thu thập
lỗi đều chạy trên đó.

Một phần email dịch vụ đi ra ngoài qua Resend, một công ty ở Hoa Kỳ, nơi gửi thư
của sản phẩm này từ vùng `eu-west-1`. Điều đó có nghĩa là địa chỉ email của bạn
và nội dung một thư dịch vụ rời khỏi Hà Lan. Không có gì khác rời đi, trừ khi
chính bạn kết nối AI, một kênh mạng xã hội hoặc một webhook.

## 6. Dữ liệu được giữ bao lâu

- Dữ liệu tài khoản và nội dung không gian làm việc — chừng nào tài khoản còn
  tồn tại.
- Các cặp bản nháp được đề xuất và văn bản đã gửi — chừng nào còn avatar mà
  chúng được thu thập cho. Xoá avatar sẽ xoá chúng ngay.
- Biên nhận đăng ký và nhật ký sử dụng AI — 90 ngày. Sau đó một tác vụ chạy hằng
  ngày sẽ xóa chúng.
- Bộ đếm theo ngày từ các trang công khai — được giữ vô thời hạn. Chúng không
  chứa gì liên quan đến một con người: một ngày, một tên sự kiện, một ngôn ngữ,
  một nhóm độ rộng, một phiên bản giao diện, một bước và một con số.
- Báo cáo lỗi — trong khoảng thời gian được cấu hình ở bộ thu thập.
- Bản sao lưu cơ sở dữ liệu có lịch riêng. Dữ liệu đã xóa biến mất khỏi chúng
  theo vòng quay của các bản sao lưu.

## 7. Quyền của bạn

Bạn có thể:

- hỏi xem dữ liệu của bạn có đang được xử lý hay không, và những gì đang được
  lưu;
- nhận một bản sao dữ liệu của bạn;
- yêu cầu sửa dữ liệu không chính xác;
- yêu cầu xóa;
- rút lại sự đồng ý nhận bản tin;
- phản đối việc xử lý;
- khiếu nại lên cơ quan bảo vệ dữ liệu ở nước bạn.

Để dùng bất kỳ quyền nào trong số đó, hãy viết đến [@content_factory_adtbot](https://t.me/content_factory_adtbot). Chúng
tôi có thể đề nghị bạn chứng minh rằng thư đến từ chủ tài khoản — nếu không,
chúng tôi sẽ trao dữ liệu của người khác cho bất cứ ai biết địa chỉ của họ.

## 8. Cách xóa tài khoản và dữ liệu của bạn

Giao diện chưa có nút “xóa tài khoản”. Hãy nhắn cho bot Telegram
[@content_factory_adtbot](https://t.me/content_factory_adtbot) và cho chúng tôi
biết địa chỉ email mà tài khoản đang dùng. Chúng tôi có thể yêu cầu thêm bằng
chứng xác minh danh tính. Sau đó, chúng tôi sẽ xóa tài khoản cùng nội dung của nó.

Những gì bạn có thể tự làm mà không cần hỏi chúng tôi:

- ngắt kết nối một kênh mạng xã hội. Việc đăng bài lên đó dừng ngay lập tức và
  kênh biến mất khỏi giao diện. Bản ghi được đánh dấu là đã xóa nhưng vẫn nằm
  trong cơ sở dữ liệu cho đến khi dữ liệu tài khoản bị gỡ bỏ;
- xóa bài đăng, tệp, chữ ký, bộ và webhook;
- xóa mọi khóa nhà cung cấp AI mà bạn đã nhập;
- hủy đăng ký bản tin bằng liên kết nằm trong chính email đó.

## 9. Độ tuổi

Dịch vụ dành cho người trưởng thành. Chúng tôi không cố ý thu thập dữ liệu của
trẻ em. Nếu hóa ra một đứa trẻ đã tạo tài khoản, chúng tôi sẽ xóa nó — hãy viết
cho chúng tôi.

## 10. Dữ liệu được bảo vệ như thế nào

- Mật khẩu chỉ được lưu dưới dạng mã băm bcrypt.
- Mật khẩu đăng nhập phải có ít nhất 12 ký tự.
- Khóa của nhà cung cấp AI và khóa API của tổ chức được lưu ở dạng mã hóa.
- Kết nối chạy qua HTTPS, cookie phiên được đánh dấu `secure` và `httpOnly`, và
  phạm vi của nó bị giới hạn đúng vào địa chỉ của dịch vụ.
- Đăng ký, đăng nhập, đặt lại mật khẩu và gửi lại email kích hoạt đều bị giới
  hạn tần suất.
- Việc đăng ký cần quản trị viên phê duyệt, nên tài khoản của người lạ không tự
  xuất hiện trên máy chủ.

Không có bảo mật hoàn hảo và chúng tôi không hứa hẹn điều đó. Chúng tôi hứa sẽ
sửa những gì mình biết được.

## 11. Nguồn mở

Content Factory được cấp phép theo AGPL-3.0. Điều đó có nghĩa là chúng tôi phải
trao mã nguồn của dịch vụ đang chạy cho bất kỳ ai sử dụng nó, và chúng tôi làm
đúng như vậy: trang web có một liên kết “Source”, còn `/api/public/source` trả về
một trang kèm kho lưu trữ đúng phiên bản đang chạy. Kho lưu trữ đó không chứa tệp
cấu hình, không chứa khóa và không chứa lịch sử commit.

Bạn không phải tin lời tài liệu này về bất cứ điều gì. Bạn có thể đọc mã nguồn.

## 12. Thay đổi đối với thông báo này

Chúng tôi có thể thay đổi thông báo này. Ngày ở đầu trang luôn cho biết lần thay
đổi gần nhất. Chủ tài khoản sẽ được thông báo qua email về những thay đổi đáng
kể.
