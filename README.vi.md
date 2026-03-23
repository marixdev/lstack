# LStack

> Môi trường phát triển cục bộ dành cho Windows và Linux.  
> Ứng dụng desktop thay thế Laragon — quản lý dịch vụ PHP, virtual host, cơ sở dữ liệu và dự án qua giao diện đồ họa hiện đại.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey)](#cài-đặt)
[![Version](https://img.shields.io/badge/version-1.0.0-green)](CHANGELOG.vi.md)

**Trang chủ:** https://lstack.dev  
**GitHub:** https://github.com/marixdev/lstack

---

## Giới thiệu

LStack là ứng dụng desktop quản lý toàn bộ stack phát triển PHP cục bộ — web server, cơ sở dữ liệu, cache và mail — không cần Docker hay WSL. Các dịch vụ chạy dưới dạng tiến trình native, dự án được phục vụ qua domain `.test` với SSL tuỳ chọn bằng mkcert.

Xây dựng với **Electron 32**, **React 18**, **TypeScript 5**, **Vite 5** và **Tailwind CSS 3**.

---

## Tính năng

- **Quản lý dịch vụ một chạm** — khởi động, dừng và khởi động lại mọi dịch vụ từ dashboard
- **Virtual host** — tự động tạo domain `.test` (ví dụ: `myapp.test`) với Nginx hoặc Apache
- **Chứng chỉ SSL** — tin tưởng CA cục bộ chỉ với một cú nhấp; HTTPS đầy đủ trên mọi dự án
- **PHP profile theo dự án** — gán một tiến trình PHP-FPM riêng với cài đặt `php.ini` và extension độc lập cho từng dự án
- **Kiểm soát PHP extension** — bật/tắt extension theo từng profile; profile tích hợp sẵn được cấu hình trước cho Laravel, WordPress, Symfony, v.v.
- **Trình tạo dự án** — khởi tạo dự án mới từ template chỉ với một cú nhấp; tự động cài đặt file CMS/framework
- **Nhận diện framework** — tự động phát hiện Laravel, WordPress, Symfony và CodeIgniter trong thư mục có sẵn
- **phpMyAdmin** — truy cập tại `phpmyadmin.test` với đăng nhập tự động (root, không cần mật khẩu)
- **Terminal tích hợp** — terminal xterm.js đầy đủ tính năng, mở thẳng trong thư mục dự án
- **Log thời gian thực** — xem log dịch vụ và access log trực tiếp trên UI
- **Package manager** — tải và cài đặt binary dịch vụ (Nginx, Apache, MariaDB, PHP, Redis, v.v.) ngay trong app, không cần cài toàn hệ thống
- **Tự động cập nhật** — kiểm tra bản cập nhật qua electron-updater
- **Giao diện song ngữ** — hỗ trợ đầy đủ tiếng Anh và tiếng Việt, chuyển đổi ngay trong app

---

## Dịch vụ

| Dịch vụ       | Cổng mặc định           | Ghi chú                                        |
|---------------|-------------------------|------------------------------------------------|
| Nginx         | 80 (HTTP), 443 (HTTPS)  | Web server mặc định                            |
| Apache        | 80 (HTTP), 443 (HTTPS)  | Lựa chọn thay thế                              |
| MariaDB       | 3306                    | Cơ sở dữ liệu tương thích MySQL                |
| PostgreSQL    | 5432                    | Cơ sở dữ liệu quan hệ thay thế                 |
| PHP-FPM       | 9100–9600 (theo profile)| Cổng hash-based theo tên profile               |
| Redis         | 6379                    | Cache in-memory / message broker               |
| Memcached     | 11211                   | Cache bộ nhớ nhẹ                               |
| Mailpit       | 1025 (SMTP), 8025 (UI)  | Bắt mail cục bộ; Web UI tại :8025              |
| MongoDB       | 27017                   | Cơ sở dữ liệu document (tùy chọn)              |

---

## PHP Profiles

Mỗi PHP profile chạy dưới dạng tiến trình riêng biệt với cổng và cài đặt `php.ini` độc lập. Nhiều dự án có thể dùng chung một profile.

| Profile        | Bộ nhớ  | Thời gian thực thi tối đa | Extension chính                                             |
|----------------|---------|---------------------------|-------------------------------------------------------------|
| **Minimal**    | 256 MB  | 60 giây                   | curl, mbstring, openssl, pdo_mysql, zip                     |
| **WordPress**  | 512 MB  | 300 giây                  | + gd, mysqli, exif, fileinfo                                |
| **Laravel**    | 512 MB  | 120 giây                  | + gd, intl, pdo_sqlite, sodium                              |
| **Symfony**    | 512 MB  | 120 giây                  | + intl, xml, pdo_sqlite                                     |
| **CodeIgniter**| 256 MB  | 120 giây                  | + intl, mysqli                                              |
| **Full Stack** | 1024 MB | 300 giây                  | + gd, soap, sodium, xsl, exif, intl, v.v.                   |
| **Tuỳ chỉnh**  | tuỳ ý   | tuỳ ý                     | Tạo profile riêng với bất kỳ cài đặt nào                    |

---

## Template dự án

Khi tạo dự án mới, LStack có thể khởi tạo từ một trong các template sau:

| Template     | Phiên bản hỗ trợ                        |
|--------------|-----------------------------------------|
| Blank PHP    | — (file `index.php` trống)              |
| Laravel      | 12, 11, 10, 9, 8                        |
| WordPress    | latest, 6.8, 6.7, 6.6, 6.5, 6.4, 5.9  |
| Symfony      | 7.3, 7.2, 6.4, 5.4                      |
| CodeIgniter  | 4.5, 4.4, 4.3, 3.1                      |
| Drupal       | 11, 10                                  |
| Joomla       | 5, 4                                    |
| PrestaShop   | 8, 1.7                                  |

---

## Domain đặc biệt

| Domain             | Mục đích                                         |
|--------------------|--------------------------------------------------|
| `localhost.test`   | Dashboard / trang welcome của LStack             |
| `phpmyadmin.test`  | phpMyAdmin (đăng nhập tự động với root)           |

Cả hai domain được tự động thêm vào file `hosts` hệ thống khi khởi động lần đầu.

---

## Cài đặt

### Bản dựng sẵn

Tải bản phát hành mới nhất tại [trang Releases](https://github.com/marixdev/lstack/releases) hoặc [lstack.dev](https://lstack.dev):

| Nền tảng    | Installer                       |
|-------------|---------------------------------|
| Windows x64 | `LStack Setup 1.0.0.exe`        |
| Linux x64   | `LStack-1.0.0.AppImage`         |
| Linux x64   | `lstack_1.0.0_amd64.deb`        |

**Windows** — chạy installer NSIS và mở LStack từ Start Menu.

**Linux (AppImage):**

```bash
chmod +x LStack-1.0.0.AppImage
./LStack-1.0.0.AppImage
```

**Linux (.deb):**

```bash
sudo dpkg -i lstack_1.0.0_amd64.deb
lstack
```

---

## Build từ mã nguồn

### Yêu cầu

- Node.js 20+
- npm 9+
- Git

### Các bước

```bash
git clone https://github.com/marixdev/lstack.git
cd lstack
npm install
```

**Phát triển (hot reload):**

```bash
npm run dev
```

**Build production:**

```bash
# Windows
npm run dist:win

# Linux (chạy trên Linux hoặc WSL)
npm run dist:linux
```

File output được đặt trong thư mục `release/`.

---

## Thư mục dữ liệu

LStack lưu toàn bộ cấu hình, dữ liệu dịch vụ, chứng chỉ và binary đã tải về tại:

```
~/.lstack/
├── nginx/             # Config và virtual host Nginx
├── apache/            # Config và virtual host Apache
├── mariadb/           # File dữ liệu MariaDB
├── postgresql/        # File dữ liệu PostgreSQL
├── redis/             # Config và persistence Redis
├── certs/             # CA mkcert và chứng chỉ theo domain
├── bins/              # Binary dịch vụ đã tải
├── php-profiles.json  # PHP profile tuỳ chỉnh
└── settings.json      # Cài đặt ứng dụng
```

Tất cả dữ liệu đều độc lập — gỡ cài đặt LStack không ảnh hưởng đến cơ sở dữ liệu hoặc cấu hình trừ khi bạn xoá thư mục này thủ công.

---

## Cài đặt ứng dụng

| Cài đặt                | Mô tả                                                         |
|------------------------|---------------------------------------------------------------|
| Thư mục dự án          | Thư mục gốc chứa dự án (mặc định: `~/LStack/www/`)           |
| Web server             | Nginx hoặc Apache                                             |
| Phiên bản PHP          | Phiên bản PHP mặc định cho profile mới                        |
| SSL provider           | mkcert; cài và tin tưởng CA cục bộ ngay trên UI               |
| Ngôn ngữ               | Tiếng Anh hoặc Tiếng Việt                                     |
| Tự động khởi động      | Tự động khởi động các dịch vụ đã bật khi mở app              |

---

## Giấy phép

[GPL-3.0](LICENSE) © LStack — https://lstack.dev

