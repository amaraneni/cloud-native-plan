# Cloud-Native .NET Plan: Week by Week

**Goal:** in 26 weeks you can run and debug Linux servers, build small and secure .NET containers, cache well in .NET (in memory, distributed, and HybridCache), choose and use NoSQL databases (Valkey/Redis, MongoDB, DynamoDB), add OpenTelemetry to any service, run apps on Kubernetes and Amazon EKS, and monitor all of it in Datadog.

**Language:** C# and .NET 10 for all the code. Bash for Linux work, and YAML for Docker Compose, Kubernetes, and Helm.

**Cost:** almost everything runs on your laptop: WSL, a Multipass VM, Docker, and a kind Kubernetes cluster. Money is spent in only two places:
- **EKS (Weeks 21–23 and 26):** about $0.10 an hour for the cluster, plus nodes, a NAT gateway, and a load balancer. Create the cluster at the start of a session and delete it at the end. Set an AWS budget alert first.
- **Datadog (Weeks 24–25):** the 14-day free trial covers both weeks if you start it on Week 24, Day 1.

**Files in this plan:**
- [schedule.html](schedule.html): **start here each day.** The dated checklist, with a dashboard, notes, and a roadmap.sh checklist for every week
- [schedule.md](schedule.md): the same checklist as a printable Markdown file
- `plan.md` (this file): the goal, the outline, and Week 1 in full
- `weeks/`: one file per section, with every day of Weeks 2–26
- [resources.md](resources.md): courses, docs, and roadmap.sh roadmaps, mapped to the weeks that use them
- `data/plan-config.json`: the plan's name, length, and sections, used by the build tools
- `data/roadmap-map.json`: which roadmap.sh topics to mark done after each week
- `tools/`: `build-html.mjs` rebuilds the HTML pages, `build-schedule.mjs` rebuilds the schedule (pass a start date to move it), `check-links.mjs` checks every link, and `fetch-roadmap-titles.mjs` refreshes roadmap.sh topic names

**Running it alongside the AI Engineering plan:** this plan saves its progress separately, so the two never mix. Doing both at once means two lessons a day. If that's too much, rebuild this one to start later, for example `node tools/build-schedule.mjs 2027-01-04`.

---

## Your main project: StudyHub

You build one .NET 10 app all the way through, and each section adds to it. StudyHub tracks learning progress: lessons, study sessions, streaks, and a leaderboard.

| Weeks | What StudyHub gets |
|---|---|
| 3–4 | Runs as a systemd service on an Ubuntu Server VM |
| 5–7 | A small, non-root container image, run with Docker Compose next to its databases |
| 8–10 | Output caching, a Valkey distributed cache, and HybridCache with tag-based invalidation |
| 11–14 | A Valkey leaderboard, MongoDB for lessons and progress, and DynamoDB for study-session events |
| 15–16 | OpenTelemetry traces, metrics, and logs, viewed in the Aspire dashboard, then in Grafana and Jaeger |
| 17–20 | Runs on Kubernetes (kind), with probes, scaling, a Helm chart, and network policies |
| 21–23 | Runs on Amazon EKS Auto Mode, with ECR, Pod Identity, a load balancer, and ElastiCache |
| 24–25 | Monitored in Datadog: hosts, containers, Kubernetes, APM traces, logs, and monitors |
| 26 | Version 1.0, documented and demoed |

---

## How each day works (about 60–90 minutes)

| Part | Time | What you do |
|---|---|---|
| **Topic** | | One thing you learn today |
| **Learn** | ~20 min | One or two docs pages or videos |
| **Do** | ~45–60 min | Build or run something real |
| **Done when** | | What you should see working |

**Day 7 each week is light:** catch up on anything you missed, tidy up, push your work to GitHub, and mark the week's roadmap.sh topics.

**Where to type commands:** this plan says **(PowerShell)** for Windows commands and **(Ubuntu)** for commands in a Linux terminal. Everything else runs inside Linux.

---

## Outline (26 weeks)

### A. Linux and Ubuntu (Weeks 1–4)
1. WSL and your first Linux distributions: Ubuntu, Debian, and Fedora side by side
2. Files, permissions, users, and processes
3. Packages, services, and an Ubuntu Server VM with Multipass
4. Networking, Bash scripting, and troubleshooting

### B. Docker in depth (Weeks 5–7)
5. Images and containers, and how they really work on Linux
6. Building small, secure .NET images
7. Networks, volumes, Docker Compose, and registries

### C. Caching in .NET (Weeks 8–10)
8. In-process caching: IMemoryCache, output caching, and HTTP caching
9. Distributed caching with Valkey and IDistributedCache
10. HybridCache, invalidation, and cache design

### D. NoSQL databases (Weeks 11–14)
11. Valkey (Redis) as a data store: data structures, streams, and persistence
12. MongoDB with C#: documents, CRUD, and indexes
13. MongoDB data modeling, aggregation, and replica sets
14. DynamoDB from .NET, and choosing the right NoSQL database

### E. Telemetry with OpenTelemetry (Weeks 15–16)
15. OpenTelemetry in .NET: traces, metrics, and logs
16. An open-source observability stack: Collector, Prometheus, Grafana, and Jaeger

### F. Kubernetes (Weeks 17–20)
17. Kubernetes basics with kind: pods, deployments, and services
18. Configuration, health probes, storage, and stateful apps
19. Gateway API, Helm, and autoscaling
20. Security and troubleshooting

### G. Amazon EKS (Weeks 21–23)
21. Your first EKS Auto Mode cluster, and ECR
22. AWS integrations: Pod Identity, load balancers, ElastiCache, and DynamoDB
23. Operating EKS: scaling, upgrades, logs, cost, and CI/CD

### H. Datadog (Weeks 24–25)
24. Datadog on Linux and Docker: Agent, integrations, logs, and dashboards
25. Datadog for .NET and Kubernetes: APM, monitors, and SLOs

### I. Capstone (Week 26)
26. StudyHub 1.0: everything together, documented and demoed

---

## Week 1: WSL and your first Linux distributions

**By the end of the week:** Ubuntu, Debian, and Fedora all running side by side in WSL, a working knowledge of how they differ, a backup of your main distribution, and your first Bash script running on all three.

**Setup you need once:** Windows 10 version 2004 or later, or Windows 11, and Windows Terminal (it's installed on Windows 11 by default).

---

### Day 1: Install WSL and Ubuntu

**Topic:** WSL (Windows Subsystem for Linux) runs real Linux distributions inside a lightweight virtual machine on Windows. A distribution, or "distro", is a Linux kernel plus a set of tools and a package manager, packaged by a vendor such as Canonical (Ubuntu) or Debian.

**Learn (~20 min)**
- [Install WSL](https://learn.microsoft.com/en-us/windows/wsl/install) (Microsoft Learn)
- [Basic commands for WSL](https://learn.microsoft.com/en-us/windows/wsl/basic-commands) (Microsoft Learn)

**Do**
1. **(PowerShell, as administrator)** install WSL and Ubuntu, then restart if Windows asks:
   ```powershell
   wsl --install -d Ubuntu
   ```
2. When Ubuntu opens, create a Linux username and password. This user is separate from your Windows account.
3. **(PowerShell)** check that it runs under WSL version 2:
   ```powershell
   wsl --list --verbose
   ```
   You should see `Ubuntu` with `VERSION 2`. If you also see `docker-desktop`, that belongs to Docker. Leave it alone.
4. **(Ubuntu)** update the system and look around:
   ```bash
   sudo apt update && sudo apt upgrade -y
   cat /etc/os-release
   uname -r
   whoami; pwd; ls -la ~
   ```

**Done when:** `wsl --list --verbose` shows Ubuntu on version 2, and `cat /etc/os-release` prints the Ubuntu version.

### Day 2: Move around the file system

**Topic:** Linux has one tree of folders that starts at `/`. Your files live in `/home/<you>` (written `~`). Your Windows drives appear under `/mnt/c`, but Linux tools run much faster on files inside the Linux file system.

**Learn (~20 min)**
- [The Linux command line for beginners](https://ubuntu.com/tutorials/command-line-for-beginners) (Ubuntu), sections 1–5
- [Working across Windows and Linux file systems](https://learn.microsoft.com/en-us/windows/wsl/filesystems) (Microsoft Learn)

**Do**
1. **(Ubuntu)** explore the main folders:
   ```bash
   ls /            # the top-level folders
   ls /etc | head  # system settings
   ls /var/log     # log files
   ls /mnt/c/Users # your Windows user folders
   ```
2. Create a workspace and practice the basics:
   ```bash
   mkdir -p ~/code/linux-lab && cd ~/code/linux-lab
   echo "hello from Linux" > hello.txt
   cp hello.txt copy.txt; mv copy.txt renamed.txt
   ls -l; cat renamed.txt; rm renamed.txt
   ```
3. Open the folder in Windows Explorer with `explorer.exe .`, and in VS Code with `code .`. The first run of `code .` installs VS Code's WSL helper.
4. Time the same command on both file systems:
   ```bash
   time (for i in $(seq 1 2000); do echo $i > /tmp/f$i; done)
   mkdir -p /mnt/c/temp/wsltest
   time (for i in $(seq 1 2000); do echo $i > /mnt/c/temp/wsltest/f$i; done)
   rm -rf /tmp/f* /mnt/c/temp/wsltest
   ```

**Done when:** you can explain what `/`, `~`, `/etc`, `/var/log`, and `/mnt/c` are, and why your code should live under `~/code`.

### Day 3: Install Debian and Fedora next to Ubuntu

**Topic:** distros differ mainly in their package manager, release cycle, and defaults. Ubuntu and Debian use `apt` and `.deb` packages. Fedora and the Red Hat family use `dnf` and `.rpm` packages. Most servers you'll meet run one of these two families.

**Learn (~15 min)**
- [Basic commands for WSL](https://learn.microsoft.com/en-us/windows/wsl/basic-commands): the sections on listing, installing, and running distributions

**Do**
1. **(PowerShell)** see what's available, then install two more distros:
   ```powershell
   wsl --list --online
   wsl --install -d Debian
   wsl --install -d FedoraLinux-44
   ```
   Use the Fedora name that `--list --online` shows, since the version number changes. Create a user in each when asked.
2. **(PowerShell)** run a command in each distro without opening it:
   ```powershell
   wsl -d Ubuntu  -- cat /etc/os-release
   wsl -d Debian  -- cat /etc/os-release
   wsl -d FedoraLinux-44 -- cat /etc/os-release
   ```
3. Update each one with its own package manager:
   ```bash
   # In Debian:
   sudo apt update && sudo apt upgrade -y
   # In Fedora:
   sudo dnf upgrade -y
   ```
4. Install the same tool in both, and compare the commands: `sudo apt install -y htop` in Debian, and `sudo dnf install -y htop` in Fedora.

**Done when:** three distros show in `wsl --list --verbose`, and you've installed a package with both `apt` and `dnf`.

### Day 4: Compare the distributions

**Topic:** knowing how to find a distro's version, kernel, package manager, and init system is the first thing you do on any unfamiliar server.

**Do:** run these in each of the three distros, and fill in a table in `~/code/linux-lab/distros.md`:
```bash
cat /etc/os-release | grep -E '^(NAME|VERSION)='
uname -r                      # the kernel (shared by all WSL distros)
ps -p 1 -o comm=              # the init system: systemd or init
command -v apt dnf apk        # which package manager exists
ls /etc/apt/sources.list.d 2>/dev/null || ls /etc/yum.repos.d  # where packages come from
df -h /                       # disk space
echo $SHELL; bash --version | head -1
```

| | Ubuntu | Debian | Fedora |
|---|---|---|---|
| Version | | | |
| Package manager | | | |
| Package format | | | |
| Init system | | | |
| Default shell | | | |

**Done when:** your table is filled in, and you've noticed that all three share the same kernel. WSL gives every distro the same Microsoft-built Linux kernel.

### Day 5: Back up, restore, and remove a distribution

**Topic:** WSL can export a whole distro to a `.tar` file and import it again. It's a full backup, and it's also how you'd make a clean copy to experiment on.

**Learn (~15 min)**
- [Import any Linux distribution to use with WSL](https://learn.microsoft.com/en-us/windows/wsl/use-custom-distro) (Microsoft Learn)

**Do**
1. **(PowerShell)** export Ubuntu, then import the copy as a new distro named `Ubuntu-Sandbox`:
   ```powershell
   mkdir C:\wsl-backups -Force
   wsl --export Ubuntu C:\wsl-backups\ubuntu-backup.tar
   wsl --import Ubuntu-Sandbox C:\wsl-backups\Ubuntu-Sandbox C:\wsl-backups\ubuntu-backup.tar
   wsl -d Ubuntu-Sandbox -u <your-linux-user>
   ```
2. In the sandbox, break something on purpose: `sudo rm -rf /usr/share/doc`. It's harmless, but you'd never do it on a real server.
3. **(PowerShell)** delete the sandbox, and confirm your real Ubuntu is untouched:
   ```powershell
   wsl --unregister Ubuntu-Sandbox
   wsl -d Ubuntu -- ls /usr/share/doc | head -3
   ```

**Done when:** you've exported, imported, and removed a distro, and you have `ubuntu-backup.tar` saved.

**Careful:** `wsl --unregister` deletes a distro and all its files permanently. Check the name twice.

### Day 6: Your first script, on every distro

**Topic:** a Bash script is a text file of commands. Writing one that runs the same on Ubuntu, Debian, and Fedora teaches you which parts differ between distros.

**Learn (~15 min)**
- [Bash Guide for Beginners](https://tldp.org/LDP/Bash-Beginners-Guide/html/) (The Linux Documentation Project), chapter 2

**Do**
1. In Ubuntu, create `~/code/linux-lab/sysinfo.sh`:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail

   . /etc/os-release
   if command -v apt >/dev/null; then pkg="apt (.deb)"
   elif command -v dnf >/dev/null; then pkg="dnf (.rpm)"
   else pkg="unknown"; fi

   echo "Distro:   $PRETTY_NAME"
   echo "Kernel:   $(uname -r)"
   echo "Packages: $pkg"
   echo "Init:     $(ps -p 1 -o comm=)"
   echo "Memory:   $(free -h | awk '/Mem:/ {print $2}') total"
   echo "Disk /:   $(df -h / | awk 'NR==2 {print $4}') free"
   ```
2. Make it executable and run it: `chmod +x sysinfo.sh && ./sysinfo.sh`.
3. **(PowerShell)** run the same file in all three distros. WSL can reach Ubuntu's files through a `\\wsl$` path, but it's simpler to copy the script to `/tmp` in each:
   ```powershell
   foreach ($d in "Ubuntu","Debian","FedoraLinux-44") {
     wsl -d Ubuntu -- cat ~/code/linux-lab/sysinfo.sh | wsl -d $d -- bash -c "cat > /tmp/sysinfo.sh && bash /tmp/sysinfo.sh"
     ""
   }
   ```

**Done when:** the script prints correct details in all three distros.

### Day 7: Review and catch-up (light)

- Finish anything you skipped this week.
- Create a GitHub repository named `cloud-native-lab`, with one folder per week. Push `linux-lab` (`distros.md` and `sysinfo.sh`) to `week-01`.
- Decide which distro you'll use day to day. This plan assumes Ubuntu.
- Mark this week's roadmap.sh topics in the schedule.

**Done when:** your Week 1 work is on GitHub.
