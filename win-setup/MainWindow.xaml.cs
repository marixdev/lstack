using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using Microsoft.Win32;

namespace LStackInstaller;

public partial class MainWindow : Window
{
    private string _installPath = @"C:\LStack";
    private string _payloadPath = "";
    private readonly bool _useEmbedded;

    public MainWindow()
    {
        InitializeComponent();

        // Detect embedded payload (production) vs external folder (dev/legacy)
        _useEmbedded = Assembly.GetExecutingAssembly()
            .GetManifestResourceNames()
            .Contains("LStackInstaller.payload.zip");

        if (!_useEmbedded)
        {
            // Fallback: find payload directory next to the installer executable
            var exeDir = Path.GetDirectoryName(Environment.ProcessPath) ?? AppContext.BaseDirectory;
            string[] candidates = ["payload", "win-unpacked", "app"];
            foreach (var name in candidates)
            {
                var path = Path.Combine(exeDir, name);
                if (Directory.Exists(path)) { _payloadPath = path; break; }
            }
            if (string.IsNullOrEmpty(_payloadPath))
            {
                var parent = Directory.GetParent(exeDir)?.FullName;
                if (parent != null)
                    foreach (var name in candidates)
                    {
                        var path = Path.Combine(parent, name);
                        if (Directory.Exists(path)) { _payloadPath = path; break; }
                    }
            }
        }

        InstallPathBox.Text = _installPath;
        SetLanguage(false); // set text only, LanguagePage is first visible
    }

    // ═══════════════════════════════════════════════════════
    //  Window chrome
    // ═══════════════════════════════════════════════════════

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton == MouseButton.Left)
            DragMove();
    }

    private void MinimizeButton_Click(object sender, RoutedEventArgs e)
        => WindowState = WindowState.Minimized;

    private void CloseButton_Click(object sender, RoutedEventArgs e)
        => Close();

    private void LangEN_Click(object sender, RoutedEventArgs e)
    {
        SetLanguage(false);
        ShowPage("Setup");
    }

    private void LangVI_Click(object sender, RoutedEventArgs e)
    {
        SetLanguage(true);
        ShowPage("Setup");
    }

    private void SetLanguage(bool vi)
    {
        // Feature list
        FeatureLine1.Text = "Nginx  ·  Apache  ·  PHP-FPM";
        FeatureLine2.Text = "MariaDB  ·  Redis  ·  Mailpit";
        FeatureLine3.Text = vi ? "PHP profiles  ·  Virtual hosts  ·  SSL"
                               : "PHP profiles  ·  Virtual hosts  ·  SSL";

        // Setup page
        TxtSetupTitle.Text           = vi ? "Bắt đầu" : "Get started";
        TxtSetupSub.Text             = vi ? "Chọn nơi cài đặt LStack." : "Choose where to install LStack.";
        TxtInstallLocation.Text      = vi ? "VỊ TRÍ CÀI ĐẶT" : "INSTALL LOCATION";
        BtnBrowse.Content            = vi ? "Chọn" : "Browse";
        DesktopShortcutCheck.Content = vi ? "Tạo shortcut trên Desktop" : "Create Desktop shortcut";
        StartMenuCheck.Content       = vi ? "Thêm vào Start Menu" : "Add to Start Menu";
        BtnInstall.Content           = vi ? "Cài đặt" : "Install";
        BtnCancel.Content            = vi ? "Hủy" : "Cancel";

        // Installing page
        TxtInstallingTitle.Text      = vi ? "Đang cài đặt LStack" : "Installing LStack";
        TxtInstallingSub.Text        = vi ? "Vui lòng giữ cửa sổ này mở." : "Please keep this window open.";

        // Complete page
        TxtAllSet.Text               = vi ? "Hoàn tất!" : "All set!";
        TxtCompleteSub.Text          = vi ? "LStack đã được cài đặt và sẵn sàng sử dụng."
                                         : "LStack is installed and ready to use.";
        LaunchCheck.Content          = vi ? "Mở LStack ngay" : "Launch LStack now";
        BtnFinish.Content            = vi ? "Hoàn thành" : "Finish";
    }

    // ═══════════════════════════════════════════════════════
    //  Setup page actions
    // ═══════════════════════════════════════════════════════

    private void Browse_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFolderDialog { Title = "Select installation folder" };
        if (dialog.ShowDialog() == true)
        {
            _installPath = dialog.FolderName;
            InstallPathBox.Text = _installPath;
        }
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => Close();

    private async void Install_Click(object sender, RoutedEventArgs e)
    {
        _installPath = InstallPathBox.Text.Trim();

        if (string.IsNullOrEmpty(_installPath))
        {
            ShowError("Please specify an installation path.");
            return;
        }

        if (!_useEmbedded && !Directory.Exists(_payloadPath))
        {
            var searchDir = Path.GetDirectoryName(Environment.ProcessPath) ?? ".";
            ShowError(
                "Application files not found.\n\n" +
                "Place a 'payload' or 'win-unpacked' folder next to the installer.\n\n" +
                $"Searched in:\n{searchDir}");
            return;
        }

        ShowPage("Installing");

        try
        {
            await Task.Run(PerformInstall);
            ShowPage("Complete");
        }
        catch (Exception ex)
        {
            ShowError($"Installation failed:\n{ex.Message}");
            ShowPage("Setup");
        }
    }

    // ═══════════════════════════════════════════════════════
    //  Installation logic
    // ═══════════════════════════════════════════════════════

    private void PerformInstall()
    {
        UpdateStatus("Preparing...", "", 0);
        Directory.CreateDirectory(_installPath);

        if (_useEmbedded)
            ExtractEmbeddedPayload();
        else
            CopyPayloadFromDisk();

        // ── Create shortcuts ────────────────────────────────
        var exePath = Path.Combine(_installPath, "LStack.exe");

        if (Dispatcher.Invoke(() => DesktopShortcutCheck.IsChecked == true))
        {
            UpdateStatus("Creating Desktop shortcut...", "", 100);
            var desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            CreateShortcut(
                Path.Combine(desktopDir, "LStack.lnk"),
                exePath, _installPath, exePath,
                "LStack - Local Development Stack");
        }

        if (Dispatcher.Invoke(() => StartMenuCheck.IsChecked == true))
        {
            UpdateStatus("Creating Start Menu entry...", "", 100);
            var startMenuDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu),
                "Programs", "LStack");
            Directory.CreateDirectory(startMenuDir);
            CreateShortcut(
                Path.Combine(startMenuDir, "LStack.lnk"),
                exePath, _installPath, exePath,
                "LStack - Local Development Stack");
        }

        // ── Registry (Add / Remove Programs) ────────────────
        UpdateStatus("Writing registry entries...", "", 100);
        WriteRegistryEntries(exePath);

        // ── Uninstaller ─────────────────────────────────────
        UpdateStatus("Creating uninstaller...", "", 100);
        CreateUninstaller();

        UpdateStatus("Installation complete!", "", 100);
    }

    private void ExtractEmbeddedPayload()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("LStackInstaller.payload.zip")!;
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);

        int total = zip.Entries.Count;
        int current = 0;

        foreach (var entry in zip.Entries)
        {
            // Skip directory entries
            if (string.IsNullOrEmpty(entry.Name)) { current++; continue; }

            var destPath = Path.Combine(_installPath, entry.FullName.Replace('/', Path.DirectorySeparatorChar));
            var destDir = Path.GetDirectoryName(destPath);
            if (destDir != null)
                Directory.CreateDirectory(destDir);

            entry.ExtractToFile(destPath, overwrite: true);

            current++;
            int pct = (int)((double)current / total * 90); // reserve 90% for extraction
            UpdateStatus($"Extracting: {entry.FullName}", $"{current} / {total} files", pct);
        }
    }

    private void CopyPayloadFromDisk()
    {
        var files = Directory.GetFiles(_payloadPath, "*", SearchOption.AllDirectories);
        int total = files.Length;
        int current = 0;

        foreach (var file in files)
        {
            var relativePath = Path.GetRelativePath(_payloadPath, file);
            var destPath = Path.Combine(_installPath, relativePath);

            var destDir = Path.GetDirectoryName(destPath);
            if (destDir != null)
                Directory.CreateDirectory(destDir);

            File.Copy(file, destPath, overwrite: true);

            current++;
            int pct = (int)((double)current / total * 90);
            UpdateStatus($"Copying: {relativePath}", $"{current} / {total} files", pct);
        }
    }

    private void WriteRegistryEntries(string exePath)
    {
        try
        {
            using var key = Registry.LocalMachine.CreateSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Uninstall\LStack");

            if (key == null) return;

            key.SetValue("DisplayName", "LStack");
            key.SetValue("DisplayVersion", "1.0.0");
            key.SetValue("Publisher", "Marix");
            key.SetValue("InstallLocation", _installPath);
            key.SetValue("DisplayIcon", exePath);
            key.SetValue("UninstallString",
                $"\"{Path.Combine(_installPath, "uninstall.cmd")}\"");
            key.SetValue("URLInfoAbout", "https://github.com/marixdev/lstack");
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);

            long totalBytes = Directory.GetFiles(_installPath, "*", SearchOption.AllDirectories)
                .Sum(f => new FileInfo(f).Length);
            key.SetValue("EstimatedSize", (int)(totalBytes / 1024), RegistryValueKind.DWord);
        }
        catch
        {
            // Registry write is non-critical; ignore if it fails
        }
    }

    private static void CreateShortcut(
        string shortcutPath, string targetPath, string workDir,
        string iconPath, string description)
    {
        try
        {
            var shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) return;

            dynamic shell = Activator.CreateInstance(shellType)!;
            dynamic shortcut = shell.CreateShortcut(shortcutPath);
            shortcut.TargetPath = targetPath;
            shortcut.WorkingDirectory = workDir;
            shortcut.IconLocation = iconPath;
            shortcut.Description = description;
            shortcut.Save();

            Marshal.ReleaseComObject(shortcut);
            Marshal.ReleaseComObject(shell);
        }
        catch
        {
            // Shortcut creation is non-critical
        }
    }

    private void CreateUninstaller()
    {
        var safeDir = _installPath.Replace("\"", "");
        var script =
            "@echo off\r\n" +
            "echo Uninstalling LStack...\r\n" +
            "taskkill /F /IM \"LStack.exe\" 2>nul\r\n" +
            "timeout /t 2 /nobreak >nul\r\n" +
            "del \"%USERPROFILE%\\Desktop\\LStack.lnk\" 2>nul\r\n" +
            "rmdir /s /q \"%PROGRAMDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\LStack\" 2>nul\r\n" +
            "reg delete \"HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\LStack\" /f 2>nul\r\n" +
            $"set \"DIR={safeDir}\"\r\n" +
            "cd /d \"%TEMP%\"\r\n" +
            "rmdir /s /q \"%DIR%\" 2>nul\r\n" +
            "echo LStack has been uninstalled.\r\n";

        File.WriteAllText(Path.Combine(_installPath, "uninstall.cmd"), script);
    }

    // ═══════════════════════════════════════════════════════
    //  UI helpers
    // ═══════════════════════════════════════════════════════

    private void UpdateStatus(string status, string fileCount, int progress)
    {
        Dispatcher.Invoke(() =>
        {
            InstallProgress.Value = progress;
            ProgressText.Text = $"{progress}%";
            StatusText.Text = status;
            FileCountText.Text = fileCount;
        });
    }

    private void ShowPage(string page)
    {
        LanguagePage.Visibility  = page == "Language"  ? Visibility.Visible : Visibility.Collapsed;
        SetupPage.Visibility     = page == "Setup"     ? Visibility.Visible : Visibility.Collapsed;
        InstallingPage.Visibility = page == "Installing" ? Visibility.Visible : Visibility.Collapsed;
        CompletePage.Visibility  = page == "Complete"  ? Visibility.Visible : Visibility.Collapsed;
    }

    private void Finish_Click(object sender, RoutedEventArgs e)
    {
        if (LaunchCheck.IsChecked == true)
        {
            var exePath = Path.Combine(_installPath, "LStack.exe");
            if (File.Exists(exePath))
                Process.Start(new ProcessStartInfo(exePath) { UseShellExecute = true });
        }
        Close();
    }

    private static void ShowError(string message)
    {
        MessageBox.Show(message, "LStack Setup", MessageBoxButton.OK, MessageBoxImage.Error);
    }
}