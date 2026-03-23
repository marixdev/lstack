# Nhật ký thay đổi

Tất cả các thay đổi đáng chú ý của LStack được ghi lại trong file này.  
Định dạng: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · Phiên bản: [Semantic Versioning](https://semver.org/)

Bản tiếng Anh: [CHANGELOG.md](CHANGELOG.md)

---

## [1.0.0] - 2026-03-23

Phiên bản ổn định đầu tiên của LStack.

### Thêm mới

#### Ứng dụng
- Ứng dụng desktop xây dựng với **Electron 32**, **React 18**, **TypeScript 5**, **Vite 5** và **Tailwind CSS 3**
- Giao diện song ngữ — **Tiếng Anh** và **Tiếng Việt** chuyển đổi linh hoạt ngay trong app
- Hỗ trợ system tray với điều khiển dịch vụ nhanh
- Tự động cập nhật qua `electron-updater`
- Thanh tiêu đề frameless tuỳ chỉnh với nút điều khiển cửa sổ
- Giao diện dark mode với Tailwind CSS và icon Lucide

#### Quản lý dịch vụ
- **Khởi động / dừng / khởi động lại** mọi dịch vụ chỉ với một cú nhấp
- Badge trạng thái thời gian thực: đang chạy, đã dừng, đang khởi động, đang dừng, lỗi
- Dịch vụ: **Nginx**, **Apache**, **MariaDB**, **PostgreSQL**, **PHP-FPM**, **Redis**, **Memcached**, **Mailpit**, **MongoDB**
- Tự động khởi động dịch vụ khi mở app (cấu hình riêng từng dịch vụ)
- Hiển thị cổng và PID của dịch vụ trên dashboard
- Xem log dịch vụ thời gian thực (theo dõi stdout/stderr ngay trên UI)

#### Virtual host & Dự án
- Tự động tạo domain `.test` khi thêm thư mục vào thư mục dự án
- Hỗ trợ **Nginx** và **Apache** làm web server, chọn riêng cho từng dự án
- Tự động tạo và tải lại config virtual host khi thêm/xoá dự án
- Tự động tạo block SSL song song với block HTTP
- Danh sách dự án với nhận diện framework: **Laravel**, **WordPress**, **Symfony**, **CodeIgniter**
- Metadata dự án: có git, có `composer.json`, có `package.json`
- Chế độ xem dạng lưới và danh sách
- Tìm kiếm / lọc dự án theo tên
- Menu ngữ cảnh mỗi dự án: mở trình duyệt, mở thư mục, mở terminal, xoá vhost

#### SSL / HTTPS
- Quản lý CA cục bộ qua **mkcert**
- Cài đặt và tin tưởng CA chỉ với một cú nhấp từ trang Cài đặt
- Tự động tạo chứng chỉ SSL cho từng domain `.test`
- Hiển thị trạng thái trust theo chứng chỉ và kiểm tra trust toàn hệ thống trên Linux

#### PHP-FPM Profiles
- PHP-FPM theo dự án: mỗi profile chạy dưới dạng **tiến trình riêng** với cổng hash-based (dải 9100–9600)
- Sáu **profile tích hợp sẵn**: Minimal, WordPress, Laravel, Symfony, CodeIgniter, Full Stack
- **Profile tuỳ chỉnh**: tạo, chỉnh sửa và xoá profile với cài đặt `php.ini` và danh sách extension tuỳ ý
- Cài đặt PHP theo profile: `memory_limit`, `max_execution_time`, `max_input_time`, `max_input_vars`, `upload_max_filesize`, `post_max_size`, `display_errors`, `date.timezone`
- Danh sách extension theo profile: bật/tắt từng extension PHP
- **Tự động nhận diện profile** khi mở dự án có sẵn (phát hiện `artisan`, `wp-config.php`, `symfony.lock`, `spark`)
- Hiện thị và chỉnh sửa profile được gán ngay trên card dự án

#### Domain đặc biệt
- `localhost.test` — dashboard / trang welcome của LStack, phục vụ bởi PHP-FPM profile `minimal`
- `phpmyadmin.test` — phpMyAdmin tự động phục vụ; đăng nhập tự động root không cần mật khẩu
- Cả hai domain được tự động thêm vào file `hosts` hệ thống khi khởi động lần đầu

#### Trình tạo dự án (Templates)
- Wizard tạo dự án trong app với chọn template và phiên bản
- Template hỗ trợ: **Blank PHP**, **Laravel** (8–12), **WordPress** (5.9–6.8/latest), **Symfony** (5.4–7.3), **CodeIgniter** (3.1–4.5), **Drupal** (10–11), **Joomla** (4–5), **PrestaShop** (1.7–8)
- Tự động tải và cài đặt file framework qua Composer / archive trực tiếp
- Tiến trình cài đặt hiển thị trong panel terminal trong app

#### Package Manager
- Duyệt, tải và cài đặt binary dịch vụ ngay trong app — không cần package manager hệ thống
- Package: Nginx, Apache, MariaDB, PHP (nhiều phiên bản), phpMyAdmin, Redis, Mailpit, PostgreSQL, MongoDB, Memcached
- Registry package tải từ `package-registry.json` đính kèm, có URL tải theo từng nền tảng
- Trạng thái cài đặt được lưu; đường dẫn binary tự động đưa vào config dịch vụ
- Thanh tiến trình tải với số byte và phần trăm
- Log cài đặt stream vào terminal trong app

#### Terminal
- Terminal **xterm.js** đầy đủ tính năng cho từng dự án (backend node-pty)
- Terminal mở sẵn trong thư mục dự án
- Panel terminal nhiều tab; đóng từng tab độc lập
- Fit addon cho resize responsive

#### Logs
- Xem log thời gian thực cho từng dịch vụ (theo dõi stdout/stderr qua chokidar)
- Modal log với tự động cuộn và khoá cuộn thủ công
- Nút xoá log

#### Cài đặt
- Thư mục dự án tuỳ chỉnh (mặc định: `~/LStack/www/`)
- Chọn web server (Nginx / Apache)
- Phiên bản PHP mặc định cho profile mới
- Trạng thái SSL provider và cài đặt CA
- Chuyển đổi ngôn ngữ (Tiếng Anh / Tiếng Việt)
- Bật/tắt tự động khởi động dịch vụ
- Dialog chọn thư mục cho các trường đường dẫn

#### Dữ liệu & Cấu hình
- Toàn bộ dữ liệu lưu tại `~/.lstack/` — không cài dịch vụ toàn hệ thống
- Config Nginx/Apache, vhost, dữ liệu MariaDB, PostgreSQL, Redis, chứng chỉ và binary đều dưới `~/.lstack/`
- `settings.json` và `php-profiles.json` trong thư mục dữ liệu
- Hỗ trợ migration từ thư mục `~/.devstack/` cũ

#### Nền tảng
- **Windows x64** — installer NSIS (`LStack Setup 1.0.0.exe`)
- **Linux x64** — AppImage (`LStack-1.0.0.AppImage`) và gói `.deb`
- Gói Linux được build và kiểm thử trên Ubuntu/Debian qua WSL hoặc Linux native

### Ghi chú

- macOS không nằm trong phạm vi phát hành v1.0.0
- Hỗ trợ MongoDB có trong package registry nhưng là tuỳ chọn; không tự động khởi động
- Dải cổng PHP-FPM 9100–9600 xác định theo tên profile (hash-based); profile `minimal` sử dụng cổng 9105

