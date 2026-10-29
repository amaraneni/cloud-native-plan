# Section A: Linux and Ubuntu (Weeks 2–4)

Week 1 is in [plan.md](../plan.md). These weeks build the Linux skills every later section relies on: containers are Linux processes, Kubernetes nodes are Linux servers, and the Datadog Agent runs on Linux. By Week 4, StudyHub runs as a proper service on an Ubuntu Server VM.

**Courses for this section (optional, see [resources.md](../resources.md)):** LinkedIn Learning's [Linux courses](https://www.linkedin.com/learning/search?keywords=Linux%20command%20line), Udemy's [Linux Mastery](https://www.udemy.com/course/linux-mastery/), and the free [Linux Journey](https://labex.io/linuxjourney).
**roadmap.sh:** [Linux](https://roadmap.sh/linux).

---

## Week 2: Files, permissions, users, and processes

**By the end of the week:** you can edit files in the terminal, read and set permissions, manage users and groups, control processes, and chain text tools together with pipes.

### Day 1: Editing files in the terminal

**Topic:** on servers there's no VS Code. You'll use `nano` for quick edits, and should know enough `vim` to change a file and get out.

**Learn (~20 min)**
- [The Linux command line for beginners](https://ubuntu.com/tutorials/command-line-for-beginners) (Ubuntu), sections 6–8
- Run `vimtutor` in Ubuntu for 15 minutes

**Do**
1. Create `~/code/linux-lab/notes.txt` with `nano`. Type three lines, save with Ctrl+O, and exit with Ctrl+X.
2. Open the same file with `vim notes.txt`. Press `i` to insert, add a line, press Esc, then type `:wq` and Enter to save and quit. Open it again and quit without saving using `:q!`.
3. Set nano as your default editor: `echo 'export EDITOR=nano' >> ~/.bashrc && source ~/.bashrc`.

**Done when:** you can edit, save, and quit in both nano and vim without searching how.

### Day 2: Permissions and ownership

**Topic:** every file has an owner, a group, and read/write/execute permissions for the owner, the group, and everyone else. `rwxr-x---` is 750 in numbers.

**Learn (~20 min)**
- [Understanding Linux file permissions](https://ubuntu.com/tutorials/command-line-for-beginners) (Ubuntu), and run `man chmod`

**Do**
```bash
cd ~/code/linux-lab
touch secret.txt script.sh
ls -l secret.txt script.sh           # read the permission columns
chmod 600 secret.txt                 # only you can read and write
chmod u+x script.sh                  # add execute for the owner
ls -l
umask                                # the default that new files start from
stat secret.txt                      # full details, including numeric permissions
sudo chown root:root secret.txt && cat secret.txt   # "Permission denied"
sudo chown "$USER":"$USER" secret.txt
```

**Done when:** you can read any `ls -l` line out loud (owner, group, and permissions), and you've seen "Permission denied" and fixed it.

### Day 3: Users, groups, and sudo

**Topic:** servers run each app as its own user, so a bug in one can't touch the others. `sudo` runs a single command as root, and is logged.

**Do**
```bash
sudo adduser --disabled-password --gecos "" studyhub   # a user for the app, with no password login
id studyhub
sudo groupadd devs && sudo usermod -aG devs "$USER"
groups "$USER"                 # devs appears after you log in again
sudo -u studyhub whoami        # run one command as another user
sudo mkdir -p /opt/studyhub && sudo chown studyhub:studyhub /opt/studyhub
ls -ld /opt/studyhub
sudo tail -n 5 /var/log/auth.log 2>/dev/null || sudo journalctl _COMM=sudo -n 5
```
Then look at `/etc/passwd` and `/etc/group` with `less`, and find your user and `studyhub`.

**Done when:** a `studyhub` user owns `/opt/studyhub`, and you can see your own sudo commands in the logs.

### Day 4: Processes and signals

**Topic:** every running program is a process with an ID (PID), a parent, and an owner. Signals ask a process to stop: `SIGTERM` politely, and `SIGKILL` forcefully.

**Learn (~15 min)**
- Run `man ps` and `man kill`, and read the signals list with `kill -l`

**Do**
```bash
sleep 600 &                    # start a background process
jobs; ps -ef --forest | head -20
pgrep -a sleep                 # find it by name
kill -TERM $(pgrep sleep)      # stop it politely
sleep 600 & disown             # keep running even if the terminal closes
top                            # press P to sort by CPU, M by memory, q to quit
htop                           # a friendlier top (install it with apt if needed)
cat /proc/$$/status | head     # your shell's own process details, from the /proc file system
```

**Done when:** you can find any process, see who owns it and how much memory it uses, and stop it.

### Day 5: Pipes and text tools

**Topic:** Linux tools each do one thing, and pipes (`|`) connect them. Most log digging is `grep`, `sort`, `uniq`, `awk`, and `sed` put together.

**Learn (~20 min)**
- [The Linux command line for beginners](https://ubuntu.com/tutorials/command-line-for-beginners) (Ubuntu), section on pipes

**Do:** create a fake web log and answer questions about it:
```bash
cd ~/code/linux-lab
for i in $(seq 1 500); do
  printf '%s GET /api/%s %s %dms\n' "$(date -d "-$i min" +%H:%M)" \
    "$(shuf -n1 -e lessons progress streaks leaderboard)" \
    "$(shuf -n1 -e 200 200 200 404 500)" "$(shuf -i 5-900 -n1)"
done > access.log

grep ' 500 ' access.log | wc -l                                  # how many errors?
awk '{print $3}' access.log | sort | uniq -c | sort -rn           # requests per endpoint
awk '$4 == 500 {print $3}' access.log | sort | uniq -c            # errors per endpoint
awk '{gsub("ms","",$5); s+=$5} END {print s/NR " ms average"}' access.log
sed 's#/api/#/v2/api/#' access.log | head -3                      # rewrite text
tail -f access.log                                                # follow a file; Ctrl+C to stop
```

**Done when:** you've answered all four questions with one-line commands.

### Day 6: Mini project, a log report script

**Do:** write `log-report.sh` that takes a log file as its argument and prints:
- total requests and the error rate (status 500) as a percentage
- the top 3 endpoints by request count
- the slowest 5 requests
- a non-zero exit code if the error rate is over 15%, so other scripts can react

Use `"$1"` for the argument, and print a usage line if it's missing (`[[ $# -eq 1 ]] || { echo "usage: $0 file"; exit 2; }`).

**Done when:** `./log-report.sh access.log; echo "exit code $?"` prints the report and the right exit code.

### Day 7: Review and catch-up (light)

- Push `linux-lab` to `cloud-native-lab/week-02`.
- Write a one-page cheat sheet of the 25 commands you used most this week.

---

## Week 3: Packages, services, and an Ubuntu Server VM

**By the end of the week:** an Ubuntu Server VM you reach over SSH, with a firewall, and the first version of StudyHub running on it as a systemd service, started on boot and logged with journald.

**Why a VM as well as WSL:** WSL distros share one kernel and skip some normal server parts. A VM is a full, separate server, which is closer to what you'll run in the cloud.

### Day 1: Packages with apt and snap

**Topic:** `apt` installs packages from repositories. `snap` installs self-contained packages from Canonical's store. You'll meet both on Ubuntu.

**Learn (~20 min)**
- [Package management](https://ubuntu.com/server/docs/how-to/software/package-management/) (Ubuntu Server docs)

**Do (Ubuntu in WSL)**
```bash
apt search ripgrep | head          # find a package
apt show ripgrep                   # its version, size, and dependencies
sudo apt install -y ripgrep jq tree
apt list --installed | wc -l
dpkg -L jq | head                  # which files a package installed
apt-cache policy jq                # which repository it came from
sudo apt remove -y tree && sudo apt autoremove -y
cat /etc/apt/sources.list.d/*.sources 2>/dev/null | head -20
```

**Done when:** you can find, inspect, install, and remove a package, and say which repository it came from.

### Day 2: An Ubuntu Server VM with Multipass

**Topic:** Multipass, from Canonical, creates Ubuntu VMs with one command, using Hyper-V on Windows. It configures them with cloud-init, the same tool cloud servers use.

**Learn (~15 min)**
- [Getting started with Multipass](https://canonical.com/multipass/docs/latest/tutorial/getting-started/)

**Do**
1. Install Multipass from [canonical.com/multipass/install](https://canonical.com/multipass/install). On Windows Home, choose VirtualBox when it asks, since Hyper-V needs Windows Pro.
2. **(PowerShell)** create a server and connect to it:
   ```powershell
   multipass launch 24.04 --name lab1 --cpus 2 --memory 2G --disk 10G
   multipass list
   multipass shell lab1
   ```
3. Inside `lab1`, run your Week 1 `sysinfo.sh` checks by hand: `cat /etc/os-release`, `ps -p 1 -o comm=`, `free -h`.
4. Stop and start it: `multipass stop lab1`, then `multipass start lab1`.

**Done when:** `lab1` runs Ubuntu Server 24.04, and you've noticed that its kernel is different from your WSL distros.

### Day 3: SSH keys and a firewall

**Topic:** you reach real servers with SSH using a key pair, never a password. `ufw` is Ubuntu's simple front end for the Linux firewall.

**Learn (~20 min)**
- [OpenSSH server](https://ubuntu.com/server/docs/how-to/security/openssh-server/) (Ubuntu Server docs)
- [Firewalls](https://ubuntu.com/server/docs/how-to/security/firewalls/) (Ubuntu Server docs)

**Do**
1. **(Ubuntu in WSL)** create a key: `ssh-keygen -t ed25519 -C "cloud-native-lab"`, and press Enter for the defaults.
2. Copy your public key into the VM:
   ```bash
   cat ~/.ssh/id_ed25519.pub | multipass.exe exec lab1 -- bash -c "cat >> ~/.ssh/authorized_keys"
   ip=$(multipass.exe info lab1 | awk '/IPv4/ {print $2}' | tr -d '\r')
   ssh ubuntu@"$ip"
   ```
3. Inside `lab1`, turn on the firewall, allowing only SSH and the port StudyHub will use:
   ```bash
   sudo ufw allow OpenSSH
   sudo ufw allow 5080/tcp
   sudo ufw enable
   sudo ufw status verbose
   ```
   **If `ssh` from WSL times out:** WSL and the Multipass VM are on different virtual networks. Switch WSL to mirrored networking. **(PowerShell)** run `notepad $env:USERPROFILE\.wslconfig`, add these two lines, save, then run `wsl --shutdown` and reopen Ubuntu:
   ```text
   [wsl2]
   networkingMode=mirrored
   ```
4. Add a host entry to `~/.ssh/config` in WSL so you can type `ssh lab1`:
   ```text
   Host lab1
     HostName <the VM's IP>
     User ubuntu
   ```

**Done when:** `ssh lab1` logs you in with your key, and `ufw status` shows only ports 22 and 5080 open.

### Day 4: systemd services and journald

**Topic:** systemd starts services at boot, restarts them if they crash, and collects their logs in the journal. A unit file describes how to run one service.

**Learn (~20 min)**
- [Understanding systemd units](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html): the overview and the `Restart=` option
- Run `man journalctl`

**Do (in lab1)**
```bash
systemctl list-units --type=service --state=running | head -20
systemctl status ssh
journalctl -u ssh -n 20 --no-pager
journalctl -p err -b --no-pager | tail       # errors since boot
systemctl list-timers --all | head           # scheduled jobs
systemd-analyze blame | head                 # what slowed down boot
```
Then create a tiny service that writes a heartbeat every 10 seconds:
```bash
sudo tee /usr/local/bin/heartbeat.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
while true; do echo "heartbeat $(date -Is)"; sleep 10; done
EOF
sudo chmod +x /usr/local/bin/heartbeat.sh
sudo tee /etc/systemd/system/heartbeat.service >/dev/null <<'EOF'
[Unit]
Description=Heartbeat demo

[Service]
ExecStart=/usr/local/bin/heartbeat.sh
Restart=always

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now heartbeat
journalctl -u heartbeat -f      # Ctrl+C to stop following
```
Kill it with `sudo pkill -f heartbeat.sh`, and watch systemd restart it.

**Done when:** your heartbeat service restarts by itself after being killed, and you can read its logs with `journalctl`.

### Day 5: StudyHub, version 0.1

**Topic:** the first version of your project: a minimal ASP.NET Core API. You'll build it in WSL and publish it as a self-contained Linux app.

**Learn (~15 min)**
- [Install .NET on Ubuntu](https://learn.microsoft.com/en-us/dotnet/core/install/linux-ubuntu-install) (Microsoft Learn)

**Do (Ubuntu in WSL)**
1. Install the .NET 10 SDK using the instructions on that page for your Ubuntu version, then run `dotnet --version`.
2. Create the app:
   ```bash
   mkdir -p ~/code/studyhub && cd ~/code/studyhub
   dotnet new web -n StudyHub.Api
   cd StudyHub.Api
   ```
3. Replace `Program.cs`:
   ```csharp
   var builder = WebApplication.CreateBuilder(args);
   var app = builder.Build();

   var lessons = new List<Lesson>
   {
       new(1, "Install WSL and Ubuntu", "linux"),
       new(2, "Files and permissions", "linux"),
       new(3, "Services with systemd", "linux")
   };

   app.MapGet("/", () => "StudyHub is running");
   app.MapGet("/health", () => Results.Ok(new { status = "ok", host = Environment.MachineName }));
   app.MapGet("/lessons", () => lessons);
   app.MapGet("/lessons/{id:int}", (int id) =>
       lessons.FirstOrDefault(l => l.Id == id) is { } l ? Results.Ok(l) : Results.NotFound());

   app.Run();

   record Lesson(int Id, string Title, string Topic);
   ```
4. Run it with `dotnet run --urls http://0.0.0.0:5080`, and open `http://localhost:5080/lessons` in your Windows browser. WSL forwards the port for you.
5. Publish a self-contained build for Linux: `dotnet publish -c Release -r linux-x64 --self-contained -o ./publish`.

**Done when:** the API returns three lessons, and `./publish/StudyHub.Api` exists.

### Day 6: Run StudyHub as a service on the VM

**Do**
1. Copy the build to `lab1`: `scp -r ./publish lab1:/tmp/studyhub`.
2. In `lab1`, install it as the `studyhub` user, as you did in Week 2:
   ```bash
   sudo adduser --system --group --no-create-home studyhub
   sudo mkdir -p /opt/studyhub && sudo cp -r /tmp/studyhub/* /opt/studyhub/
   sudo chown -R studyhub:studyhub /opt/studyhub
   sudo tee /etc/systemd/system/studyhub.service >/dev/null <<'EOF'
   [Unit]
   Description=StudyHub API
   After=network.target

   [Service]
   User=studyhub
   WorkingDirectory=/opt/studyhub
   ExecStart=/opt/studyhub/StudyHub.Api --urls http://0.0.0.0:5080
   Environment=ASPNETCORE_ENVIRONMENT=Production
   Restart=on-failure
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   EOF
   sudo systemctl daemon-reload && sudo systemctl enable --now studyhub
   systemctl status studyhub --no-pager
   ```
3. From WSL, run `curl http://<lab1 IP>:5080/health`.
4. Restart the VM (`sudo reboot`), and check that StudyHub comes back on its own.

**Done when:** StudyHub answers from the VM, runs as `studyhub` (not root), and starts again after a reboot.

### Day 7: Review and catch-up (light)

- Push `studyhub` and your unit file to `cloud-native-lab/week-03`.
- Write down every step of today's deployment. You'll automate them next week.

---

## Week 4: Networking, Bash scripting, and troubleshooting

**By the end of the week:** you can find out why a service isn't reachable, write robust scripts, schedule jobs, and deploy StudyHub to the VM with one script.

### Day 1: Networking basics

**Topic:** most server problems are "it can't connect". `ip` shows addresses and routes, `ss` shows which ports are listening, and `curl`, `dig`, and `nc` test connections.

**Learn (~20 min)**
- [Configuring networks](https://ubuntu.com/server/docs/explanation/networking/configuring-networks/) (Ubuntu Server docs)

**Do (in lab1)**
```bash
ip -br addr                 # interfaces and IP addresses
ip route                    # the default gateway
resolvectl status | head    # which DNS servers are used
ss -tlnp                    # TCP ports listening, and which process owns each
curl -sv http://localhost:5080/health 2>&1 | head -20
dig +short learn.microsoft.com
nc -zv localhost 5080; nc -zv localhost 6000
cat /etc/hosts
```

**Done when:** you can say which IP lab1 has, which DNS server it uses, and which process is listening on port 5080.

### Day 2: Breaking the network on purpose

**Do:** in lab1, cause three failures one at a time, and record each error message:
1. **Service down:** `sudo systemctl stop studyhub`, then `curl localhost:5080` gives "Connection refused".
2. **Firewall:** start StudyHub again, run `sudo ufw delete allow 5080/tcp`, then curl it from WSL. The request **times out**, but works from inside the VM.
3. **DNS:** add `127.0.0.1 learn.microsoft.com` to `/etc/hosts`, then `curl -I https://learn.microsoft.com` fails or gets the wrong answer. Remove the line afterwards.

Undo each change.

**Done when:** you have a table telling refused, timeout, and DNS failures apart, with the command that confirms each one.

### Day 3: Bash scripting that doesn't break

**Topic:** good scripts stop on errors, quote their variables, check their inputs, and clean up after themselves.

**Learn (~25 min)**
- [Bash Guide for Beginners](https://tldp.org/LDP/Bash-Beginners-Guide/html/), chapters 7–9 (conditionals, loops, and functions)

**Do:** write `~/code/linux-lab/wait-for.sh`, a script that waits until a URL returns HTTP 200, or fails after a timeout:
```bash
#!/usr/bin/env bash
set -euo pipefail

usage() { echo "usage: $0 <url> [timeout-seconds]" >&2; exit 2; }
[[ $# -ge 1 ]] || usage
url=$1
timeout=${2:-30}

deadline=$((SECONDS + timeout))
until curl -fsS -o /dev/null "$url"; do
  if (( SECONDS >= deadline )); then
    echo "Timed out after ${timeout}s waiting for $url" >&2
    exit 1
  fi
  sleep 1
done
echo "$url is up"
```
Test it against StudyHub while it's running, and while it's stopped.

**Done when:** it prints "is up" when StudyHub runs, and exits with code 1 after the timeout when it doesn't.

### Day 4: Scheduled jobs with cron and systemd timers

**Topic:** cron is the classic scheduler. systemd timers do the same job with logging and dependencies. You'll meet both.

**Do (in lab1)**
1. A cron job that records StudyHub's health every 5 minutes. Run `crontab -e` and add:
   ```text
   */5 * * * * curl -fsS http://localhost:5080/health >> /tmp/health.log 2>&1
   ```
2. The same thing as a systemd timer:
   ```bash
   sudo tee /etc/systemd/system/healthcheck.service >/dev/null <<'EOF'
   [Unit]
   Description=Check StudyHub health
   [Service]
   Type=oneshot
   ExecStart=/usr/bin/curl -fsS http://localhost:5080/health
   EOF
   sudo tee /etc/systemd/system/healthcheck.timer >/dev/null <<'EOF'
   [Unit]
   Description=Run the StudyHub health check every 5 minutes
   [Timer]
   OnBootSec=1min
   OnUnitActiveSec=5min
   [Install]
   WantedBy=timers.target
   EOF
   sudo systemctl daemon-reload && sudo systemctl enable --now healthcheck.timer
   systemctl list-timers healthcheck.timer
   ```
3. After 10 minutes, compare `cat /tmp/health.log` with `journalctl -u healthcheck`.

**Done when:** both schedules ran at least twice, and you can say why the timer is easier to debug.

### Day 5: Disks, memory, and logs filling up

**Topic:** a full disk or memory shortage takes services down without warning. Knowing `df`, `du`, `free`, and log rotation prevents a lot of outages.

**Do (in lab1)**
```bash
df -h                                  # free space per file system
sudo du -xh / --max-depth=2 2>/dev/null | sort -h | tail -10   # the biggest folders
free -h; cat /proc/meminfo | head -5   # memory
sudo journalctl --disk-usage           # how much space logs use
sudo journalctl --vacuum-size=100M     # shrink the journal
cat /etc/logrotate.d/rsyslog           # how text logs are rotated
dmesg | tail                           # kernel messages, including out-of-memory kills
```
Then create a 1 GB file with `fallocate -l 1G /tmp/big.file`, watch `df -h` change, and delete it.

**Done when:** you can find what's filling a disk, and you know where out-of-memory kills are logged.

### Day 6: Mini project, a one-command deploy

**Do:** write `deploy.sh` in `~/code/studyhub` that:
1. publishes StudyHub with `dotnet publish` (self-contained, linux-x64)
2. copies it to the VM with `rsync -az --delete ./publish/ lab1:/tmp/studyhub/` (install rsync on both sides first)
3. over SSH, stops the service, copies the files into `/opt/studyhub`, fixes ownership, and starts it again
4. uses your `wait-for.sh` to check `/health` responds, and exits non-zero if it doesn't

Change the `/` message in `Program.cs`, run `./deploy.sh`, and check the new message.

**Done when:** one command deploys a new version and confirms it's healthy.

### Day 7: Review and catch-up (light)

- Push `deploy.sh`, `wait-for.sh`, and your notes to `cloud-native-lab/week-04`.
- **Keep the lab1 VM.** You'll install the Datadog Agent on it in Week 24. Run `multipass stop lab1` to save resources until then.
- Section A is complete. Mark the topics on [roadmap.sh/linux](https://roadmap.sh/linux).
