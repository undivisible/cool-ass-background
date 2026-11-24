using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Windows.Media.Control;
using Windows.Storage.Streams;

internal static class Program {
    [STAThread] static void Main() { ApplicationConfiguration.Initialize(); Application.Run(new Wallpaper()); }
}

sealed class Wallpaper : Form {
    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    readonly NotifyIcon tray = new() { Icon = SystemIcons.Application, Text = "Background", Visible = true };
    readonly System.Windows.Forms.Timer timer = new() { Interval = 4000 };
    bool local, busy;
    int generation;
    nint desktop;
    public Wallpaper() {
        Text = "Background"; FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual;
        Bounds = SystemInformation.VirtualScreen; Controls.Add(web);
        var menu = new ContextMenuStrip();
        var presets = JsonSerializer.Deserialize<Dictionary<string, string[]>>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "web/presets.json")))!;
        foreach (var name in presets.Keys) menu.Items.Add(name, null, async (_, _) => { generation++; local = false; await Call("preset", name); });
        menu.Items.Add("Sync local playback", null, async (_, _) => { generation++; local = true; await Call("preset", "Drift"); await Poll(); });
        menu.Items.Add("Connect Last.fm…", null, async (_, _) => {
            using var dialog = new Form { Text = "Last.fm (held in memory)", Width = 360, Height = 210, StartPosition = FormStartPosition.CenterScreen };
            var user = new TextBox { Top = 30, Left = 16, Width = 310, PlaceholderText = "Username" };
            var key = new TextBox { Top = 70, Left = 16, Width = 310, PlaceholderText = "Public API key (not password)" };
            var connect = new Button { Text = "Connect", Top = 115, Left = 16, DialogResult = DialogResult.OK };
            dialog.Controls.AddRange([user, key, connect]); dialog.AcceptButton = connect;
            if (dialog.ShowDialog() == DialogResult.OK && user.Text.Length > 0 && key.Text.Length > 0) { generation++; local = false; await Call("lastfm", user.Text, key.Text); }
        });
        menu.Items.Add("Quit", null, (_, _) => Close()); tray.ContextMenuStrip = menu;
        Shown += async (_, _) => {
            try {
                desktop = FindDesktop();
                if (desktop == 0) throw new InvalidOperationException("Explorer's wallpaper surface was not found. Restart Explorer and relaunch.");
                SetParent(Handle, desktop);
                var rect = SystemInformation.VirtualScreen;
                var point = new Point(rect.Left, rect.Top); ScreenToClient(desktop, ref point);
                SetWindowPos(Handle, 0, point.X, point.Y, rect.Width, rect.Height, 0x10);
                await web.EnsureCoreWebView2Async(await CoreWebView2Environment.CreateAsync(null, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CoolAssBackground", "WebView")));
                web.CoreWebView2.SetVirtualHostNameToFolderMapping("background.local", Path.Combine(AppContext.BaseDirectory, "web"), CoreWebView2HostResourceAccessKind.Allow);
                web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                web.CoreWebView2.Navigate("https://background.local/index.html?wallpaper=1");
                timer.Tick += async (_, _) => { if (!IsWindow(desktop)) { MessageBox.Show("Explorer restarted; please relaunch the wallpaper."); Close(); return; } await Poll(); };
                timer.Start();
            } catch (Exception e) { MessageBox.Show(e.Message, "Wallpaper could not start"); Close(); }
        };
        FormClosed += (_, _) => { timer.Dispose(); tray.Dispose(); web.Dispose(); };
        Microsoft.Win32.SystemEvents.DisplaySettingsChanged += DisplaysChanged;
        FormClosed += (_, _) => Microsoft.Win32.SystemEvents.DisplaySettingsChanged -= DisplaysChanged;
    }
    protected override bool ShowWithoutActivation => true;
    protected override CreateParams CreateParams { get { var p = base.CreateParams; p.ExStyle |= 0x08000000 | 0x80; return p; } }
    void DisplaysChanged(object? sender, EventArgs args) { BeginInvoke(() => { MessageBox.Show("Display layout changed. Relaunch the wallpaper to fit the new layout."); Close(); }); }
    async Task Call(string method, params object[] args) {
        if (web.CoreWebView2 != null) await web.ExecuteScriptAsync($"window.wallpaper?.{method}(...{JsonSerializer.Serialize(args)})");
    }
    async Task Poll() {
        if (!local || busy) return; busy = true; var ticket = generation;
        try {
            var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            var session = manager.GetCurrentSession();
            if (session == null || session.GetPlaybackInfo().PlaybackStatus != GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing) return;
            var info = await session.TryGetMediaPropertiesAsync();
            if (info.Thumbnail == null) return;
            using var stream = await info.Thumbnail.OpenReadAsync();
            if (stream.Size > 8000000) return;
            using var reader = new DataReader(stream); await reader.LoadAsync((uint)stream.Size);
            var bytes = new byte[(int)stream.Size]; reader.ReadBytes(bytes);
            if (local && ticket == generation) await Call("track", new { id = $"{info.Artist}\0{info.AlbumTitle}\0{info.Title}", title = info.Title, artwork = $"data:{stream.ContentType};base64,{Convert.ToBase64String(bytes)}" });
        } catch (Exception) { tray.Text = "Playback unavailable; try Last.fm"; }
        finally { busy = false; }
    }
    static nint FindDesktop() {
        var progman = FindWindow("Progman", null);
        SendMessageTimeout(progman, 0x052C, 0, 0, 0, 1000, out _);
        nint worker = 0;
        EnumWindows((window, _) => {
            if (FindWindowEx(window, 0, "SHELLDLL_DefView", null) != 0) worker = FindWindowEx(0, window, "WorkerW", null);
            return true;
        }, 0);
        return worker;
    }
    delegate bool EnumProc(nint window, nint data);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern nint FindWindow(string name, string? title);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern nint FindWindowEx(nint parent, nint after, string name, string? title);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, nint data);
    [DllImport("user32.dll")] static extern nint SetParent(nint child, nint parent);
    [DllImport("user32.dll")] static extern bool SetWindowPos(nint window, nint after, int x, int y, int w, int h, uint flags);
    [DllImport("user32.dll")] static extern bool ScreenToClient(nint window, ref Point point);
    [DllImport("user32.dll")] static extern bool IsWindow(nint window);
    [DllImport("user32.dll")] static extern nint SendMessageTimeout(nint window, uint message, nint w, nint l, uint flags, uint timeout, out nint result);
}
