---
title: Bên nhận dữ liệu
updated: 2026-08-20
language: vi
---

# Bên nhận dữ liệu

## 1. Danh sách này là gì

Đây là danh sách tất cả những bên mà Content Factory có thể gửi dữ liệu đến, và
cho biết những gì đến với từng bên. Nó được viết ra bằng cách đọc mã nguồn, chứ
không phải bằng cách rà qua tên các dịch vụ, và nó thay đổi khi sản phẩm thay
đổi.

Nếu một bên nhận không có trong danh sách này, không có gì đi đến họ.

## 2. Cách đọc danh sách

Các bên nhận chia thành ba nhóm:

- **luôn hoạt động** — tham gia vào việc vận hành dịch vụ mà không cần bất cứ
  điều gì từ bạn;
- **được bật lên theo quyết định của bạn** — im lặng cho đến khi bạn hoặc một
  quản trị viên của không gian làm việc của bạn cấu hình chúng;
- **những gì sản phẩm này không có** — những thứ mà một sản phẩm như thế này
  thường mang theo còn sản phẩm này thì không.

Mỗi mục cho biết họ là ai, những gì đi đến họ, vì sao, và dữ liệu được xử lý ở
đâu.

## 3. Luôn hoạt động

### 3.1 Resend — gửi email dịch vụ

**Là ai.** Một dịch vụ gửi email, một công ty ở Hoa Kỳ. Thư của sản phẩm này được
gửi từ vùng `eu-west-1`.

**Những gì đi.** Địa chỉ người nhận, tiêu đề và nội dung của một email dịch vụ.
Có ba loại: kích hoạt tài khoản, đặt lại mật khẩu, và xác nhận địa chỉ khi thêm
cách đăng nhập bằng mật khẩu. Các email xác nhận của chính bản tin cũng đi qua
cùng một khóa.

**Những gì không đi.** Nội dung bài đăng, tệp đã tải lên, token của các nền tảng
đã kết nối, dữ liệu tổ chức.

**Vì sao.** Không có dịch vụ gửi thư thì việc đặt lại mật khẩu không hoạt động và
một địa chỉ không thể trở thành cách đăng nhập: nó chỉ trở thành như vậy sau khi
liên kết trong email được mở. Chúng tôi không có máy chủ thư của riêng mình, và
một email xác nhận gửi từ máy chủ của chúng tôi sẽ lặng lẽ rơi vào thư rác.

### 3.2 Listmonk — bản tin

**Là ai.** Một hệ thống bản tin. Nó chạy trên máy chủ của chính chúng tôi. Nó
không phải một công ty bên ngoài.

**Những gì đi.** Địa chỉ email của một tài khoản mới — và chỉ sau khi bạn đã đánh
dấu rõ ràng vào ô đó lúc đăng ký. Không có dấu tích thì không có gì đi cả.

**Ở đâu.** Địa chỉ không rời khỏi mạng của máy chủ chúng tôi. Listmonk gửi các
email xác nhận đăng ký của nó qua cùng Resend đó.

**Cách hủy đăng ký.** Bằng liên kết nằm trong chính email đó.

### 3.3 Bộ thu thập lỗi của chính chúng tôi

**Là ai.** Bộ thu thập lỗi của chúng tôi, trên máy chủ của chính chúng tôi. Không
phải Sentry.io và không phải bất kỳ dịch vụ bên ngoài nào khác.

**Những gì đi.** Một định danh sự kiện, thời gian, một mức độ, môi trường, phiên
bản bản dựng, tên dịch vụ, loại lỗi và các khung ngăn xếp: đường dẫn tệp tính từ
gốc kho mã, tên hàm, dòng và cột.

**Những gì không đi.** Người dùng, yêu cầu, tiêu đề, cookie, địa chỉ IP,
User-Agent, breadcrumb, văn bản của mô hình, các trường tùy ý. Sự kiện được dựng
lại từ một danh sách trường được phép, chứ không phải chuyển tiếp nguyên trạng.
Trình duyệt gửi nó đến chính địa chỉ của trang web, không gửi thẳng đến bộ thu
thập.

### 3.4 Telegram — đăng nhập

**Là ai.** Telegram, nếu bạn đăng nhập qua nó.

**Những gì đi.** Phần trao đổi OpenID Connect trong lúc đăng nhập. Nút bấm chỉ
xuất hiện khi việc đăng nhập bằng Telegram được cấu hình trên máy chủ này.

## 4. Được bật lên theo quyết định của bạn

### 4.1 Mô hình AI: OpenAI và OpenRouter

**Những gì đi.** Prompt và nội dung bài đăng.

**Khi nào.** Chỉ khi một không gian làm việc tự cấu hình AI: hoặc bằng cách nhập
khóa của chính mình, hoặc bằng cách được quản trị viên cấp một hạn mức trên một
khóa do máy chủ quản lý. Không có sự bắc cầu nào giữa hai chế độ đó: khóa của tổ
chức này không bao giờ được dùng cho tổ chức khác, và khóa dùng chung không bao
giờ được thế vào chỗ một khóa riêng còn thiếu.

**Khóa nằm ở đâu.** Khóa của riêng một tổ chức được lưu ở dạng mã hóa trong cơ sở
dữ liệu.

### 4.2 Tavily — tìm kiếm trên web

**Những gì đi.** Các truy vấn tìm kiếm mà sản phẩm dựng lên trong lúc chuẩn bị tư
liệu.

**Khi nào.** Theo cùng quy tắc như các mô hình AI: chỉ sau khi một không gian làm
việc cấu hình nó.

### 4.3 API của các mạng xã hội

**Những gì đi.** Nội dung bài đăng và các tệp đính kèm.

**Khi nào.** Sau khi bạn kết nối một kênh và lên lịch hoặc xuất bản một bài đăng.

**Chính xác là ở đâu.** Đến mạng mà bạn đã kết nối kênh của nó: Facebook,
Instagram, Threads, LinkedIn, TikTok, Pinterest, Reddit, Slack, Discord,
Telegram, VK, Mastodon, X và các nền tảng được hỗ trợ khác. Những gì xảy ra với
dữ liệu sau đó chịu sự điều chỉnh của quy tắc bên nền tảng ấy.

### 4.4 Webhook và các liên kết bạn cung cấp

**Những gì đi.** Nếu bạn thiết lập một webhook — trọn vẹn đối tượng bài đăng, đến
địa chỉ bạn đã đưa. Nếu bạn đưa cho sản phẩm một liên kết để lấy nội dung về, máy
chủ sẽ tự nó đi lấy.

**Khi nào.** Chỉ khi bạn trực tiếp hành động. Bạn chọn địa chỉ.

## 5. Những gì sản phẩm này không có

Sản phẩm hoàn toàn không mang theo công cụ phân tích sản phẩm của bên thứ ba nào.
Đã gỡ bỏ cùng các phụ thuộc của chúng: PostHog, Plausible, Google Tag Manager,
dub, datafa.st, pixel của Facebook và các sự kiện phía máy chủ của Facebook,
Sentry dạng dịch vụ, tiện ích trò chuyện Chatbase, trình chỉnh sửa ảnh Polotno,
Beehiiv.

Việc đưa bất kỳ thứ nào trong đó trở lại — dưới dạng một phụ thuộc, một import
hay một địa chỉ ghi cứng — sẽ làm hỏng một bước kiểm tra tự động khi dựng. Các
trang đang chạy không tải một script bên ngoài nào. Phông chữ là phông cục bộ.
Giao diện người dùng không thực hiện yêu cầu ra bên ngoài nào một cách trực tiếp:
mọi thứ đều đi qua backend của chính chúng tôi.

Không có mạng quảng cáo nào. Không dữ liệu nào bị bán. Không có gì được chia sẻ
với các bên môi giới dữ liệu.

## 6. Nơi đặt máy chủ

Máy chủ đặt tại Hà Lan. Cơ sở dữ liệu, các tệp, hệ thống bản tin và bộ thu thập
lỗi đều chạy trên đó. Chúng tôi không nêu tên công ty cho thuê máy chủ.

Bên nhận duy nhất nằm ngoài Hà Lan mà tham gia vào việc vận hành dịch vụ dù bạn
không làm gì cả là Resend. Mọi thứ trong mục 4 đều được bật lên theo quyết định
của chính bạn.

## 7. Thay đổi đối với danh sách này

Danh sách thay đổi theo sản phẩm. Ngày ở đầu trang cho biết lần thay đổi gần
nhất. Một bên nhận mới xuất hiện trên danh sách này trước khi dữ liệu đầu tiên
đến với họ.

## 8. Liên hệ

Câu hỏi về danh sách này: bot Telegram [@content_factory_adtbot](https://t.me/content_factory_adtbot).
