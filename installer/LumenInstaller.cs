// Lumen Installer – kleines Windows-Programm: Pakete auswählen, IP des Fernsehers eingeben,
// installieren. Kopiert die Pakete mit scp auf den Fernseher und installiert sie dort mit
// install.sh (über ssh). Beides läuft in einem Konsolenfenster, in das du das Passwort
// des Fernsehers eintippst – der Installer selbst speichert oder sieht kein Passwort.
//
// Versteht:  *.ipk                        App-Pakete (Lumen, Lumen Leiste, andere Homebrew-Apps)
//            *.zip mit tvclean/tvclean.sh tvclean-Update
//            *.zip mit .ipk-Dateien       mehrere Apps auf einmal
//
// Zwei Arten: Update (Fernseher hat Lumen schon) oder Komplettinstallation auf einem neuen,
// gerooteten Fernseher (legt tvclean.conf an, startet den Fernseher danach neu).
// „Fernseher suchen“ findet LG-Fernseher im Netz (SSDP) und prüft, ob SSH an ist.
//
// Bauen (Linux, Mono):  siehe build.sh

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: AssemblyTitle("Lumen Installer")]
[assembly: AssemblyProduct("Lumen")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace LumenInstaller
{
    class Pkg
    {
        public string Kind;     // "app" oder "tvclean"
        public string Path;     // .ipk-Datei bzw. tvclean-Ordner
        public string Id;       // App-ID, bei tvclean "tvclean"
        public string Name;
        public string Version;
        public string Source;   // Dateiname, aus dem das Paket stammt
    }

    // ------------------------------------------------------------------
    // Pakete lesen, Installation vorbereiten (ohne Oberfläche, auch für den Selbsttest)
    // ------------------------------------------------------------------
    static class Core
    {
        static readonly Dictionary<string, string> Known = new Dictionary<string, string> {
            { "de.lumenhome.launcher", "Lumen" },
            { "de.lumenhome.leiste", "Lumen Leiste" },
            { "org.webosbrew.hbchannel", "Homebrew Channel" }
        };

        public static string WorkRoot = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "LumenInstaller");
        static int counter;

        static int ReadFull(Stream s, byte[] buf, int n)
        {
            int got = 0;
            while (got < n) { int r = s.Read(buf, got, n - got); if (r <= 0) break; got += r; }
            return got;
        }

        // .ipk = ar-Archiv mit debian-binary, control.tar.gz, data.tar.gz
        public static Pkg ReadIpk(string path, string source)
        {
            var p = new Pkg { Kind = "app", Path = path, Source = source, Version = "?" };
            var info = ReadControl(path);
            string id, v, desc;
            info.TryGetValue("Package", out id);
            info.TryGetValue("Version", out v);
            info.TryGetValue("Description", out desc);
            p.Id = string.IsNullOrEmpty(id) ? null : id;
            if (!string.IsNullOrEmpty(v)) p.Version = v;
            string known;
            if (p.Id != null && Known.TryGetValue(p.Id, out known)) p.Name = known;
            else if (!string.IsNullOrEmpty(desc)) p.Name = desc;
            else p.Name = p.Id ?? System.IO.Path.GetFileNameWithoutExtension(path);
            return p;
        }

        static Dictionary<string, string> ReadControl(string path)
        {
            using (var fs = File.OpenRead(path))
            {
                var magic = new byte[8];
                if (ReadFull(fs, magic, 8) != 8 || Encoding.ASCII.GetString(magic) != "!<arch>\n")
                    throw new Exception("keine gültige .ipk-Datei");
                var hdr = new byte[60];
                while (ReadFull(fs, hdr, 60) == 60)
                {
                    string name = Encoding.ASCII.GetString(hdr, 0, 16).Trim().TrimEnd(new[] { '/' });
                    long size;
                    if (!long.TryParse(Encoding.ASCII.GetString(hdr, 48, 10).Trim(), out size) || size < 0)
                        throw new Exception("beschädigte .ipk-Datei");
                    if (name == "control.tar.gz")
                    {
                        var data = new byte[size];
                        ReadFull(fs, data, (int)size);
                        try { return ParseControlTar(data); }
                        catch { return new Dictionary<string, string>(); }   // Paket trotzdem installierbar
                    }
                    fs.Seek(size + (size & 1), SeekOrigin.Current);
                }
            }
            return new Dictionary<string, string>();
        }

        static Dictionary<string, string> ParseControlTar(byte[] gz)
        {
            byte[] tar;
            using (var ms = new MemoryStream(gz))
            using (var g = new GZipStream(ms, CompressionMode.Decompress))
            using (var o = new MemoryStream()) { g.CopyTo(o); tar = o.ToArray(); }
            int pos = 0;
            while (pos + 512 <= tar.Length)
            {
                string fname = Encoding.ASCII.GetString(tar, pos, 100).TrimEnd(new[] { '\0' });
                if (fname.Length == 0) break;
                string sz = Encoding.ASCII.GetString(tar, pos + 124, 12).Trim(new[] { '\0', ' ' });
                long size = sz.Length > 0 ? Convert.ToInt64(sz, 8) : 0;
                if (fname == "./control" || fname == "control")
                {
                    string txt = Encoding.UTF8.GetString(tar, pos + 512, (int)Math.Min(size, tar.Length - pos - 512));
                    var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    foreach (var line in txt.Split(new[] { '\n' }))
                    {
                        int i = line.IndexOf(':');
                        if (i > 0 && !char.IsWhiteSpace(line[0])) d[line.Substring(0, i).Trim()] = line.Substring(i + 1).Trim();
                    }
                    return d;
                }
                pos += 512 + (int)((size + 511) / 512 * 512);
            }
            throw new Exception("control fehlt");
        }

        public static Pkg TvcleanPkg(string dir, string source)
        {
            var m = Regex.Match(source ?? "", @"(?:update[-_ ]?|tvclean[-_ ]?v?)(\d+)", RegexOptions.IgnoreCase);
            return new Pkg { Kind = "tvclean", Id = "tvclean", Path = dir, Source = source,
                Name = "tvclean (Root-Paket)", Version = m.Success ? "Update " + m.Groups[1].Value : "" };
        }

        // Datei oder Ordner → Pakete
        public static List<Pkg> Open(string f)
        {
            var list = new List<Pkg>();
            string name = System.IO.Path.GetFileName(f.TrimEnd(new[] { '\\', '/' }));
            if (Directory.Exists(f))
            {
                if (File.Exists(System.IO.Path.Combine(f, "tvclean.sh"))) list.Add(TvcleanPkg(f, name));
                else if (File.Exists(System.IO.Path.Combine(f, "tvclean", "tvclean.sh"))) list.Add(TvcleanPkg(System.IO.Path.Combine(f, "tvclean"), name));
                foreach (var ipk in Directory.GetFiles(f, "*.ipk")) list.Add(ReadIpk(ipk, System.IO.Path.GetFileName(ipk)));
                if (list.Count == 0) throw new Exception("Ordner ohne .ipk-Dateien oder tvclean");
                return list;
            }
            string ext = System.IO.Path.GetExtension(f).ToLowerInvariant();
            if (ext == ".ipk") { list.Add(ReadIpk(f, name)); return list; }
            if (ext != ".zip") throw new Exception("kein .ipk- oder .zip-Paket");

            using (var z = ZipFile.OpenRead(f))
            {
                if (z.Entries.Any(e => e.FullName.Replace('\\', '/').EndsWith("lumen/js/core.js")))
                    throw new Exception("das ist der Quellcode, kein Installationspaket");
                var tv = z.Entries.FirstOrDefault(e => e.Name == "tvclean.sh");
                var ipks = z.Entries.Where(e => e.Name.EndsWith(".ipk", StringComparison.OrdinalIgnoreCase)).ToList();
                if (tv == null && ipks.Count == 0) throw new Exception("enthält weder Apps (.ipk) noch tvclean");
                string dir = System.IO.Path.Combine(WorkRoot, "zip-" + DateTime.Now.Ticks + "-" + (++counter));
                Directory.CreateDirectory(dir);
                z.ExtractToDirectory(dir);
                if (tv != null)
                {
                    string rel = tv.FullName.Replace('\\', '/');
                    rel = rel.Substring(0, rel.Length - "tvclean.sh".Length).Trim(new[] { '/' });
                    list.Add(TvcleanPkg(rel.Length > 0 ? System.IO.Path.Combine(dir, rel.Replace('/', System.IO.Path.DirectorySeparatorChar)) : dir, name));
                }
                foreach (var e in ipks)
                    list.Add(ReadIpk(System.IO.Path.Combine(dir, e.FullName.Replace('/', System.IO.Path.DirectorySeparatorChar)), name));
            }
            return list;
        }

        static string Safe(string s) { return Regex.Replace(s ?? "", @"[^A-Za-z0-9._-]", "_"); }

        static void CopyDir(string from, string to)
        {
            Directory.CreateDirectory(to);
            foreach (var f in Directory.GetFiles(from)) File.Copy(f, System.IO.Path.Combine(to, System.IO.Path.GetFileName(f)), true);
            foreach (var d in Directory.GetDirectories(from)) CopyDir(d, System.IO.Path.Combine(to, System.IO.Path.GetFileName(d)));
        }

        static byte[] Script()
        {
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("install.sh"))
            using (var o = new MemoryStream()) { s.CopyTo(o); return o.ToArray(); }
        }

        // Ordner für den Fernseher: <id>.ipk …, tvclean/, install.sh, ids.txt, restart
        public static void Stage(List<Pkg> pkgs, string stage, bool restart, bool reboot = false)
        {
            if (Directory.Exists(stage)) Directory.Delete(stage, true);
            Directory.CreateDirectory(stage);
            var ids = new StringBuilder();
            int k = 0;
            foreach (var p in pkgs)
            {
                if (p.Kind == "tvclean") { CopyDir(p.Path, System.IO.Path.Combine(stage, "tvclean")); continue; }
                k++;
                string n = p.Id != null ? Safe(p.Id) : "app-" + k;
                File.Copy(p.Path, System.IO.Path.Combine(stage, n + ".ipk"), true);
                if (p.Id != null) ids.Append(p.Id).Append('\n');
            }
            File.WriteAllBytes(System.IO.Path.Combine(stage, "install.sh"), Script());
            File.WriteAllText(System.IO.Path.Combine(stage, "ids.txt"), ids.ToString(), new UTF8Encoding(false));
            if (restart) File.WriteAllText(System.IO.Path.Combine(stage, "restart"), "1\n");
            if (reboot) File.WriteAllText(System.IO.Path.Combine(stage, "reboot"), "1\n");
        }

        public static string FindTool(string exe)
        {
            var cands = new List<string>();
            string win = Environment.GetEnvironmentVariable("SystemRoot") ?? @"C:\Windows";
            if (Environment.Is64BitOperatingSystem && !Environment.Is64BitProcess)
                cands.Add(System.IO.Path.Combine(win, "Sysnative", "OpenSSH", exe));
            cands.Add(System.IO.Path.Combine(win, "System32", "OpenSSH", exe));
            foreach (var d in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(new[] { System.IO.Path.PathSeparator }))
                if (d.Trim().Length > 0) cands.Add(System.IO.Path.Combine(d.Trim().Trim(new[] { '"' }), exe));
            foreach (var c in cands) { try { if (File.Exists(c)) return c; } catch { } }
            return null;
        }

        // scp ab OpenSSH 9 überträgt per SFTP – das kann der Fernseher nicht, dort braucht es -O.
        // Ältere Versionen kennen -O nicht, nutzen aber ohnehin das alte Verfahren.
        public static bool ScpNeedsLegacyFlag(string ssh)
        {
            try
            {
                var psi = new ProcessStartInfo(ssh, "-V") { UseShellExecute = false, RedirectStandardError = true, RedirectStandardOutput = true, CreateNoWindow = true };
                using (var p = Process.Start(psi))
                {
                    string s = p.StandardError.ReadToEnd() + p.StandardOutput.ReadToEnd();
                    p.WaitForExit(3000);
                    var m = Regex.Match(s, @"OpenSSH\D*(\d+)\.(\d+)");
                    if (m.Success) return int.Parse(m.Groups[1].Value) >= 9;
                }
            }
            catch { }
            return true;
        }

        static string EchoSafe(string s) { return Regex.Replace(s ?? "", @"[^A-Za-z0-9 .,+_-]", ""); }

        // Konsolenfenster: kopieren (scp), installieren (ssh). Passwort tippst du dort ein.
        public static string Cmd(string host, string folder, List<Pkg> pkgs, string scp, string ssh, bool legacy)
        {
            string names = string.Join(", ", pkgs.Select(p => EchoSafe(p.Name + (string.IsNullOrEmpty(p.Version) || p.Version == "?" ? "" : " " + p.Version))));
            string opt = "-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10";
            var L = new List<string> {
                "@echo off",
                "chcp 65001 >nul",
                "title Lumen Installer - Fernseher " + host,
                "cd /d \"" + WorkRoot + "\"",
                "echo.",
                "echo   Lumen Installer  -  Fernseher " + host,
                "echo   --------------------------------------------------",
                "echo   Pakete: " + names,
                "echo.",
                "echo   Der Fernseher fragt gleich ZWEIMAL nach dem Passwort.",
                "echo   Eintippen und Enter druecken. Beim Tippen erscheinen keine Zeichen - das ist normal.",
                "echo.",
                "echo   [1/2] Dateien auf den Fernseher kopieren ...",
                "\"" + scp + "\" " + (legacy ? "-O " : "") + opt + " -r " + folder + " root@" + host + ":/tmp/",
                "if errorlevel 1 goto copyfail",
                "echo.",
                "echo   [2/2] Auf dem Fernseher installieren ...",
                "\"" + ssh + "\" -t " + opt + " root@" + host + " \"sh /tmp/" + folder + "/install.sh\"",
                "set ERR=%errorlevel%",
                "echo.",
                "if \"%ERR%\"==\"0\" goto done",
                "if \"%ERR%\"==\"255\" echo   Keine Verbindung oder falsches Passwort.",
                "if not \"%ERR%\"==\"255\" echo   Es gab Fehler - siehe [!!] oben.",
                "goto end",
                ":copyfail",
                "set ERR=20",
                "echo.",
                "echo   Kopieren fehlgeschlagen. Passwort richtig? Fernseher an und im selben Netz?",
                "goto end",
                ":done",
                "echo   Fertig - alles installiert.",
                ":end",
                "echo.",
                "echo   Taste druecken, um dieses Fenster zu schliessen.",
                "pause >nul",
                "exit /b %ERR%"
            };
            return string.Join("\r\n", L) + "\r\n";
        }

        public static bool ValidHost(string h)
        {
            return Regex.IsMatch(h ?? "", @"^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$");
        }

        public static bool PortOpen(string host, int port, int ms)
        {
            try
            {
                using (var c = new TcpClient())
                {
                    var t = c.ConnectAsync(host, port);
                    return t.Wait(ms) && c.Connected;
                }
            }
            catch { return false; }
        }

        // ---------- Fernseher im Netz finden ----------
        public class Tv { public string Ip, Name; public bool Ssh; }

        static List<IPAddress> LocalIPv4()
        {
            var list = new List<IPAddress>();
            try
            {
                foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    foreach (var ua in ni.GetIPProperties().UnicastAddresses)
                    {
                        var a = ua.Address;
                        if (a.AddressFamily != AddressFamily.InterNetwork) continue;
                        var b = a.GetAddressBytes();
                        if (b[0] == 169 && b[1] == 254) continue;
                        list.Add(a);
                    }
                }
            }
            catch { }
            return list;
        }

        static async Task<bool> PortOpenAsync(string host, int port, int ms)
        {
            var c = new TcpClient();
            try
            {
                var t = c.ConnectAsync(host, port);
                var done = await Task.WhenAny(t, Task.Delay(ms));
                return done == t && !t.IsFaulted && c.Connected;
            }
            catch { return false; }
            finally { try { c.Close(); } catch { } }
        }

        // LG-Fernseher melden sich per SSDP als „webos-second-screen“
        static async Task<Dictionary<string, string>> Ssdp(List<IPAddress> locals, int ms)
        {
            var found = new Dictionary<string, string>();   // IP → LOCATION
            string msg = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\n" +
                         "ST: urn:lge-com:service:webos-second-screen:1\r\n\r\n";
            var bytes = Encoding.ASCII.GetBytes(msg);
            var jobs = locals.Select(async local =>
            {
                try
                {
                    using (var u = new UdpClient(new IPEndPoint(local, 0)))
                    {
                        try { u.Client.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.MulticastInterface, local.GetAddressBytes()); } catch { }
                        var dest = new IPEndPoint(IPAddress.Parse("239.255.255.250"), 1900);
                        await u.SendAsync(bytes, bytes.Length, dest);
                        await Task.Delay(100);
                        await u.SendAsync(bytes, bytes.Length, dest);
                        var end = DateTime.Now.AddMilliseconds(ms);
                        while (DateTime.Now < end)
                        {
                            var rt = u.ReceiveAsync();
                            var left = (int)Math.Max(1, (end - DateTime.Now).TotalMilliseconds);
                            if (await Task.WhenAny(rt, Task.Delay(left)) != rt) break;
                            var r = rt.Result;
                            string txt = Encoding.ASCII.GetString(r.Buffer);
                            var m = Regex.Match(txt, @"(?im)^LOCATION:\s*(\S+)");
                            lock (found) { found[r.RemoteEndPoint.Address.ToString()] = m.Success ? m.Groups[1].Value : ""; }
                        }
                    }
                }
                catch { }
            }).ToArray();
            await Task.WhenAll(jobs);
            return found;
        }

        static string FriendlyName(string location)
        {
            try
            {
                if (string.IsNullOrEmpty(location)) return null;
                var rq = (HttpWebRequest)WebRequest.Create(location);
                rq.Timeout = 1500; rq.ReadWriteTimeout = 1500;
                using (var rs = rq.GetResponse())
                using (var sr = new StreamReader(rs.GetResponseStream()))
                {
                    var m = Regex.Match(sr.ReadToEnd(), @"<friendlyName>([^<]+)</friendlyName>");
                    return m.Success ? WebUtilityDecode(m.Groups[1].Value.Trim()) : null;
                }
            }
            catch { return null; }
        }
        static string WebUtilityDecode(string s) { return WebUtility.HtmlDecode(s); }

        public static async Task<List<Tv>> FindTvs()
        {
            var locals = LocalIPv4();
            var own = new HashSet<string>(locals.Select(a => a.ToString()));
            var result = new Dictionary<string, Tv>();

            // 1. SSDP
            var ssdp = await Ssdp(locals, 2500);
            foreach (var kv in ssdp)
            {
                if (own.Contains(kv.Key)) continue;
                string loc = kv.Value;
                result[kv.Key] = new Tv { Ip = kv.Key, Name = await Task.Run(() => FriendlyName(loc)) ?? "LG-Fernseher" };
            }
            // 2. falls SSDP nichts bringt: im eigenen Netz nach LG-typischen Ports suchen (3000/3001)
            if (result.Count == 0)
            {
                var probes = new List<Task>();
                foreach (var a in locals)
                {
                    var b = a.GetAddressBytes();
                    for (int i = 1; i < 255; i++)
                    {
                        string host = b[0] + "." + b[1] + "." + b[2] + "." + i;
                        if (own.Contains(host)) continue;
                        probes.Add(Task.Run(async () =>
                        {
                            if (await PortOpenAsync(host, 3000, 700) || await PortOpenAsync(host, 3001, 700))
                                lock (result) { if (!result.ContainsKey(host)) result[host] = new Tv { Ip = host, Name = "LG-Fernseher?" }; }
                        }));
                    }
                }
                await Task.WhenAll(probes);
            }
            // SSH an?
            await Task.WhenAll(result.Values.Select(async t => { t.Ssh = await PortOpenAsync(t.Ip, 22, 1500); }).ToArray());
            return result.Values.OrderByDescending(t => t.Ssh).ThenBy(t => t.Ip).ToList();
        }

        public static void CleanOld()
        {
            try
            {
                if (!Directory.Exists(WorkRoot)) return;
                foreach (var d in Directory.GetDirectories(WorkRoot))
                    if (Directory.GetLastWriteTime(d) < DateTime.Now.AddDays(-1)) Directory.Delete(d, true);
                foreach (var f in Directory.GetFiles(WorkRoot))
                    if (File.GetLastWriteTime(f) < DateTime.Now.AddDays(-1)) File.Delete(f);
            }
            catch { }
        }
    }

    // ------------------------------------------------------------------
    // Oberfläche
    // ------------------------------------------------------------------
    class MainForm : Form
    {
        static readonly Color Accent = Color.FromArgb(10, 132, 255);
        static readonly Color Good = Color.FromArgb(26, 127, 55);
        static readonly Color Bad = Color.FromArgb(198, 40, 40);
        static readonly Color Muted = Color.FromArgb(96, 100, 110);

        TextBox ip;
        Label ipState, status, hint;
        ListView list;
        CheckBox restart;
        RadioButton modeUpdate, modeFull;
        Label modeHint;
        Button add, remove, check, install, search;
        bool firstRun;
        readonly List<Pkg> pkgs = new List<Pkg>();
        readonly string settingsFile;
        string lastDir;
        bool busy;

        public MainForm(string[] args)
        {
            settingsFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "LumenInstaller", "einstellungen.txt");
            SuspendLayout();
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            Text = "Lumen Installer";
            Font = new Font("Segoe UI", 10F);
            BackColor = Color.White;
            ClientSize = new Size(720, 680);
            MinimumSize = new Size(560, 480);
            StartPosition = FormStartPosition.CenterScreen;
            AllowDrop = true;
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            var t = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, Padding = new Padding(20, 16, 20, 18), BackColor = Color.White };
            t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            var title = new Label { Text = "Lumen Installer", AutoSize = true, Font = new Font("Segoe UI Semibold", 16F), Margin = new Padding(0, 0, 0, 0) };
            var sub = new Label { Text = "Apps und Updates auf den Fernseher bringen", AutoSize = true, ForeColor = Muted, Margin = new Padding(1, 0, 0, 14) };

            var modeLabel = new Label { Text = "Was möchtest du tun?", AutoSize = true, Font = new Font("Segoe UI Semibold", 10F), Margin = new Padding(0, 0, 0, 2) };
            var modeRow = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(0, 0, 0, 0) };
            modeUpdate = new RadioButton { Text = "Update (Lumen ist schon drauf)", AutoSize = true, Margin = new Padding(0, 0, 18, 0) };
            modeFull = new RadioButton { Text = "Neuer Fernseher – Komplettinstallation", AutoSize = true, Margin = new Padding(0) };
            modeRow.Controls.AddRange(new Control[] { modeUpdate, modeFull });
            modeHint = new Label { AutoSize = true, ForeColor = Muted, Margin = new Padding(0, 2, 0, 12), MaximumSize = new Size(680, 0) };

            var ipLabel = new Label { Text = "IP-Adresse des Fernsehers", AutoSize = true, Font = new Font("Segoe UI Semibold", 10F), Margin = new Padding(0, 0, 0, 4) };
            var ipRow = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(0, 0, 0, 2) };
            ip = new TextBox { Width = 200, Margin = new Padding(0, 2, 8, 0) };
            search = new Button { Text = "Fernseher suchen", AutoSize = true, Margin = new Padding(0, 0, 6, 0) };
            check = new Button { Text = "Verbindung prüfen", AutoSize = true, Margin = new Padding(0, 0, 10, 0) };
            ipState = new Label { AutoSize = true, Margin = new Padding(0, 2, 0, 10), MaximumSize = new Size(680, 0) };
            ipRow.Controls.AddRange(new Control[] { ip, search, check });

            var pkLabel = new Label { Text = "Pakete", AutoSize = true, Font = new Font("Segoe UI Semibold", 10F), Margin = new Padding(0, 0, 0, 2) };
            hint = new Label { Text = "Apps (.ipk) oder tvclean-Update (.zip) – über „Hinzufügen…“ oder einfach hierher ziehen.", AutoSize = true, ForeColor = Muted, Margin = new Padding(0, 0, 0, 6) };

            list = new ListView { View = View.Details, FullRowSelect = true, HideSelection = false, Dock = DockStyle.Fill, AllowDrop = true, Margin = new Padding(0, 0, 0, 8) };
            list.Columns.Add("Paket", 210);
            list.Columns.Add("Version", 110);
            list.Columns.Add("Datei", 300);

            var btnRow = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(0, 0, 0, 10) };
            add = new Button { Text = "Hinzufügen…", AutoSize = true, Margin = new Padding(0, 0, 8, 0) };
            remove = new Button { Text = "Entfernen", AutoSize = true, Margin = new Padding(0, 0, 8, 0), Enabled = false };
            btnRow.Controls.AddRange(new Control[] { add, remove });

            restart = new CheckBox { Text = "Lumen danach neu starten", AutoSize = true, Checked = true, Margin = new Padding(0, 0, 0, 10) };

            status = new Label { AutoSize = true, ForeColor = Muted, Margin = new Padding(0, 0, 0, 10), MaximumSize = new Size(640, 0) };

            install = new Button { Text = "Auf den Fernseher installieren", Dock = DockStyle.Fill, Height = 46, FlatStyle = FlatStyle.Flat,
                BackColor = Accent, ForeColor = Color.White, Font = new Font("Segoe UI Semibold", 11F), Margin = new Padding(0), Cursor = Cursors.Hand };
            install.FlatAppearance.BorderSize = 0;

            Control[] rows = { title, sub, modeLabel, modeRow, modeHint, ipLabel, ipRow, ipState, pkLabel, hint, list, btnRow, restart, status, install };
            foreach (var c in rows)
            {
                t.RowStyles.Add(c == list ? new RowStyle(SizeType.Percent, 100) : c == install ? new RowStyle(SizeType.Absolute, 46) : new RowStyle(SizeType.AutoSize));
                t.Controls.Add(c);
            }
            Controls.Add(t);
            ResumeLayout(false);
            PerformLayout();

            // Ereignisse
            add.Click += delegate { Pick(); };
            remove.Click += delegate { RemoveSelected(); };
            check.Click += async delegate { await CheckHost(); };
            search.Click += async delegate { await Search(); };
            modeUpdate.CheckedChanged += delegate { ModeChanged(); };
            modeFull.CheckedChanged += delegate { ModeChanged(); };
            install.Click += async delegate { await Install(); };
            list.SelectedIndexChanged += delegate { remove.Enabled = !busy && list.SelectedItems.Count > 0; };
            list.KeyDown += (s, e) => { if (e.KeyCode == Keys.Delete) RemoveSelected(); };
            DragEventHandler enter = (s, e) => { e.Effect = !busy && e.Data.GetDataPresent(DataFormats.FileDrop) ? DragDropEffects.Copy : DragDropEffects.None; };
            DragEventHandler drop = (s, e) => { var f = e.Data.GetData(DataFormats.FileDrop) as string[]; if (f != null && !busy) AddFiles(f); };
            DragEnter += enter; DragDrop += drop; list.DragEnter += enter; list.DragDrop += drop;
            Resize += delegate { status.MaximumSize = new Size(Math.Max(200, ClientSize.Width - 40), 0); FitColumns(); };
            FormClosing += delegate { Save(); };

            LoadSettings();
            Core.CleanOld();
            if (firstRun) modeFull.Checked = true; else modeUpdate.Checked = true;
            Cue(ip, "z. B. 192.168.178.45");
            if (pkgs.Count == 0) Status("Wähle die Pakete aus – über „Hinzufügen…“ oder einfach hierher ziehen.", Muted);
            ActiveControl = add;
            // auf die .exe gezogene Dateien erst übernehmen, wenn das Fenster steht
            Shown += delegate
            {
                if (args != null && args.Length > 0) AddFiles(args.Where(a => !a.StartsWith("--")));
                if (pkgs.Count > 0) install.Focus();
            };
            FitColumns();
        }

        void FitColumns()
        {
            if (list.Columns.Count < 3) return;
            int w = list.ClientSize.Width - list.Columns[0].Width - list.Columns[1].Width - 4;
            list.Columns[2].Width = Math.Max(120, w);
        }

        void LoadSettings()
        {
            ip.Text = "";
            lastDir = Path.GetDirectoryName(Application.ExecutablePath);
            firstRun = !File.Exists(settingsFile);
            try
            {
                if (firstRun) return;
                foreach (var line in File.ReadAllLines(settingsFile))
                {
                    int i = line.IndexOf('=');
                    if (i <= 0) continue;
                    string k = line.Substring(0, i), v = line.Substring(i + 1).Trim();
                    if (k == "ip" && v.Length > 0) ip.Text = v;
                    if (k == "ordner" && Directory.Exists(v)) lastDir = v;
                }
            }
            catch { }
        }

        void Save()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(settingsFile));
                File.WriteAllText(settingsFile, "ip=" + ip.Text.Trim() + "\r\nordner=" + lastDir + "\r\n");
                firstRun = false;
            }
            catch { }
        }

        void Status(string text, Color color) { status.Text = text; status.ForeColor = color; }

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, string l);
        static void Cue(TextBox t, string text) { try { SendMessage(t.Handle, 0x1501, (IntPtr)1, text); } catch { } }

        void ModeChanged()
        {
            if (modeFull.Checked)
            {
                modeHint.Text = "Voraussetzung: Der Fernseher ist gerootet, der Homebrew Channel ist installiert und darin ist der SSH-Server eingeschaltet. " +
                                "Installiert Lumen, Lumen Leiste und tvclean und startet den Fernseher danach neu.";
                restart.Text = "Fernseher danach neu starten (bei der Erstinstallation nötig)";
                restart.Checked = true; restart.Enabled = false;
                AddBundled();
            }
            else
            {
                modeHint.Text = "Spielt neue Versionen ein. Deine Einstellungen auf dem Fernseher bleiben erhalten.";
                restart.Text = "Lumen danach neu starten";
                restart.Checked = true; restart.Enabled = !busy;
            }
        }

        // Komplettinstallation: Pakete aus dem Ordner der .exe übernehmen, falls sie dort liegen
        void AddBundled()
        {
            try
            {
                string dir = Path.GetDirectoryName(Application.ExecutablePath);
                var files = new List<string>();
                foreach (var n in new[] { "lumen.ipk", "lumen-leiste.ipk" })
                {
                    string f = Path.Combine(dir, n);
                    if (File.Exists(f)) files.Add(f);
                }
                var tv = new DirectoryInfo(dir).GetFiles("tvclean*.zip").OrderByDescending(x => x.LastWriteTime).FirstOrDefault();
                if (tv != null) files.Add(tv.FullName);
                files = files.Where(f => !pkgs.Any(p => string.Equals(Path.GetFileName(f), p.Source, StringComparison.OrdinalIgnoreCase))).ToList();
                if (files.Count > 0) AddFiles(files);
            }
            catch { }
        }

        async Task Search()
        {
            search.Enabled = false;
            ipState.Text = "suche im Netz …"; ipState.ForeColor = Muted;
            List<Core.Tv> tvs;
            try { tvs = await Core.FindTvs(); }
            catch { tvs = new List<Core.Tv>(); }
            search.Enabled = !busy;
            if (tvs.Count == 0)
            {
                ipState.Text = "✗ Keinen LG-Fernseher gefunden. Ist er an und im selben Netz? Sonst die IP-Adresse aus Einstellungen → Netzwerk eintragen."; ipState.ForeColor = Bad;
                return;
            }
            Action<Core.Tv> take = t =>
            {
                ip.Text = t.Ip;
                ipState.Text = t.Ssh ? "✓ " + t.Name : "✗ " + t.Name + ": SSH ist aus";
                ipState.ForeColor = t.Ssh ? Good : Bad;
                if (!t.Ssh) Status("Am Fernseher den Homebrew Channel öffnen → Einstellungen → „SSH Server“ einschalten. Ohne Root-Zugang (Homebrew Channel) geht es nicht.", Bad);
                else Save();
            };
            if (tvs.Count == 1) { take(tvs[0]); return; }
            var menu = new ContextMenuStrip();
            foreach (var t in tvs)
            {
                var tv = t;
                menu.Items.Add(tv.Name + "  –  " + tv.Ip + (tv.Ssh ? "" : "  (SSH aus)"), null, delegate { take(tv); });
            }
            ipState.Text = tvs.Count + " Fernseher gefunden – bitte wählen"; ipState.ForeColor = Muted;
            menu.Show(search, new Point(0, search.Height));
        }

        void Pick()
        {
            using (var d = new OpenFileDialog
            {
                Title = "Pakete auswählen",
                Filter = "Lumen-Pakete (*.ipk;*.zip)|*.ipk;*.zip|Alle Dateien (*.*)|*.*",
                Multiselect = true,
                InitialDirectory = lastDir
            })
            {
                if (d.ShowDialog(this) != DialogResult.OK) return;
                lastDir = Path.GetDirectoryName(d.FileNames[0]);
                AddFiles(d.FileNames);
            }
        }

        void AddFiles(IEnumerable<string> files)
        {
            var errors = new List<string>();
            foreach (var f in files)
            {
                try
                {
                    foreach (var p in Core.Open(f))
                    {
                        // gleiches Paket nochmal → das neue ersetzt das alte
                        pkgs.RemoveAll(x => x.Kind == p.Kind && x.Id != null && x.Id == p.Id);
                        pkgs.Add(p);
                    }
                }
                catch (Exception e) { errors.Add(Path.GetFileName(f.TrimEnd(new[] { '\\', '/' })) + ": " + e.Message); }
            }
            Fill();
            if (errors.Count > 0)
                MessageBox.Show(this, string.Join("\n", errors), "Nicht hinzugefügt", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            if (pkgs.Count > 0) Status(pkgs.Count + (pkgs.Count == 1 ? " Paket" : " Pakete") + " bereit.", Muted);
        }

        void Fill()
        {
            list.BeginUpdate();
            list.Items.Clear();
            foreach (var p in pkgs)
            {
                var it = new ListViewItem(new[] { p.Name, p.Version ?? "", p.Source ?? "" }) { Tag = p };
                list.Items.Add(it);
            }
            list.EndUpdate();
            remove.Enabled = false;
        }

        void RemoveSelected()
        {
            if (busy) return;
            foreach (ListViewItem it in list.SelectedItems) pkgs.Remove((Pkg)it.Tag);
            Fill();
            Status(pkgs.Count == 0 ? "Keine Pakete ausgewählt." : pkgs.Count + (pkgs.Count == 1 ? " Paket" : " Pakete") + " bereit.", Muted);
        }

        void SetBusy(bool b)
        {
            busy = b;
            foreach (Control c in new Control[] { ip, check, search, add, install, modeUpdate, modeFull }) c.Enabled = !b;
            restart.Enabled = !b && !modeFull.Checked;
            remove.Enabled = !b && list.SelectedItems.Count > 0;
            install.BackColor = b ? Color.FromArgb(150, 180, 220) : Accent;
            UseWaitCursor = false;
        }

        async Task<bool> CheckHost()
        {
            string host = ip.Text.Trim();
            if (!Core.ValidHost(host)) { ipState.Text = "✗ keine gültige Adresse"; ipState.ForeColor = Bad; return false; }
            ipState.Text = "prüfe …"; ipState.ForeColor = Muted;
            check.Enabled = false;
            bool ok = await Task.Run(() => Core.PortOpen(host, 22, 3000));
            check.Enabled = !busy;
            ipState.Text = ok ? "✓ erreichbar" : "✗ nicht erreichbar";
            ipState.ForeColor = ok ? Good : Bad;
            if (ok) Save();
            return ok;
        }

        async Task Install()
        {
            if (busy) return;
            if (pkgs.Count == 0) { Status("Bitte zuerst Pakete hinzufügen.", Bad); return; }
            bool full = modeFull.Checked;
            if (full)
            {
                var missing = new List<string>();
                if (!pkgs.Any(p => p.Id == "de.lumenhome.launcher")) missing.Add("Lumen (lumen.ipk)");
                if (!pkgs.Any(p => p.Id == "de.lumenhome.leiste")) missing.Add("Lumen Leiste (lumen-leiste.ipk)");
                if (!pkgs.Any(p => p.Kind == "tvclean")) missing.Add("tvclean (tvclean-….zip)");
                if (missing.Count > 0 && MessageBox.Show(this, "Für eine Komplettinstallation fehlen:\n\n  " + string.Join("\n  ", missing) +
                        "\n\nTrotzdem installieren?", "Pakete fehlen", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            }
            string host = ip.Text.Trim();
            if (!Core.ValidHost(host)) { Status("Bitte die IP-Adresse des Fernsehers eingeben, z. B. 192.168.178.45.", Bad); ip.Focus(); return; }
            string scp = Core.FindTool("scp.exe"), ssh = Core.FindTool("ssh.exe");
            if (scp == null || ssh == null)
            {
                Status("Der OpenSSH-Client fehlt. Windows-Einstellungen → System → Optionale Features → „OpenSSH-Client“ hinzufügen.", Bad);
                return;
            }
            SetBusy(true);
            Status("Prüfe die Verbindung zum Fernseher …", Muted);
            if (!await CheckHost())
            {
                SetBusy(false);
                Status("Der Fernseher antwortet unter " + host + " nicht (SSH, Port 22). Ist er an und im selben Netz?", Bad);
                return;
            }

            string stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
            string folder = "lumen-inst-" + stamp;
            string stage = Path.Combine(Core.WorkRoot, folder);
            string cmd = Path.Combine(Core.WorkRoot, "installieren-" + stamp + ".cmd");
            try
            {
                Core.Stage(pkgs, stage, !full && restart.Checked, full);
                bool legacy = await Task.Run(() => Core.ScpNeedsLegacyFlag(ssh));
                File.WriteAllText(cmd, Core.Cmd(host, folder, pkgs, scp, ssh, legacy), new UTF8Encoding(false));
            }
            catch (Exception e)
            {
                SetBusy(false);
                Status("Vorbereiten fehlgeschlagen: " + e.Message, Bad);
                return;
            }

            Status("Die Installation läuft im schwarzen Fenster. Gib dort zweimal das Passwort deines Fernsehers ein (Standard: alpine).", Accent);
            int code;
            try
            {
                var p = Process.Start(new ProcessStartInfo("cmd.exe", "/c \"\"" + cmd + "\"\"") { UseShellExecute = true, WorkingDirectory = Core.WorkRoot });
                code = await Task.Run(() => { p.WaitForExit(); return p.ExitCode; });
            }
            catch (Exception e)
            {
                SetBusy(false);
                Status("Konsolenfenster ließ sich nicht öffnen: " + e.Message, Bad);
                return;
            }
            try { Directory.Delete(stage, true); File.Delete(cmd); } catch { }
            SetBusy(false);

            if (code == 0 && full)
            {
                Status("Fertig – alles installiert. Der Fernseher startet gerade neu.", Good);
                MessageBox.Show(this,
                    "Alles installiert. Der Fernseher startet neu – danach am Fernseher noch einrichten:\n\n" +
                    "1. Einstellungen → Allgemein → System → Zusätzliche Einstellungen → Home-Einstellungen → " +
                    "Einschaltbildschirm: „Home“. Dann startet der Fernseher direkt in Lumen.\n\n" +
                    "2. „LG Input Hook“ aus dem Homebrew Channel installieren und die Tasten belegen:\n" +
                    "     Home-Taste  →  sh /home/root/go-home\n" +
                    "     Eingänge (Source)  →  sh /home/root/go-inputs\n" +
                    "     Einstellungen (Zahnrad)  →  sh /home/root/go-settings\n\n" +
                    "3. In Lumen unter „Anpassen“: Name für die Begrüßung, Source-Taste → „Leiste über dem Bild“, " +
                    "Licht (WLED), falls vorhanden.\n\n" +
                    "Wichtig: keine Firmware-Updates installieren und die LG-Developer-Mode-App nicht installieren – " +
                    "beides kann den Root-Zugang kosten.",
                    "Lumen ist installiert", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else if (code == 0) Status("Fertig – alles installiert.", Good);
            else if (code == 20) Status("Kopieren auf den Fernseher fehlgeschlagen (Passwort falsch oder Verbindung weg). Einfach nochmal versuchen.", Bad);
            else if (code == 255) Status("Keine Verbindung oder falsches Passwort. Einfach nochmal versuchen.", Bad);
            else Status("Es gab Fehler bei der Installation – die Meldungen standen im schwarzen Fenster (Zeilen mit [!!]).", Bad);
        }
    }

    static class Program
    {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

        [STAThread]
        static int Main(string[] args)
        {
            // Selbsttest ohne Oberfläche: --info <Dateien…> | --stage <Ziel> <Dateien…>
            if (args.Length > 0 && (args[0] == "--info" || args[0] == "--stage"))
            {
                try
                {
                    var files = args.Skip(args[0] == "--stage" ? 2 : 1);
                    var pkgs = new List<Pkg>();
                    foreach (var f in files) pkgs.AddRange(Core.Open(f));
                    foreach (var p in pkgs) Console.WriteLine(p.Kind + "|" + p.Id + "|" + p.Name + "|" + p.Version + "|" + p.Source);
                    if (args[0] == "--stage")
                    {
                        Core.Stage(pkgs, args[1], true);
                        File.WriteAllText(Path.Combine(args[1], "test.cmd"), Core.Cmd("192.168.178.45", Path.GetFileName(args[1]), pkgs, @"C:\Windows\System32\OpenSSH\scp.exe", @"C:\Windows\System32\OpenSSH\ssh.exe", true));
                    }
                    return 0;
                }
                catch (Exception e) { Console.WriteLine("FEHLER|" + e.Message); return 1; }
            }
            try { SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm(args));
            return 0;
        }
    }
}
