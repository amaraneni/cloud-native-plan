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
