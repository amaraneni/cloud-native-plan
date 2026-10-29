# Section H: Datadog (Weeks 24–25)

Datadog is one of the most widely used commercial monitoring platforms. Many companies use it instead of, or alongside, the open-source stack from Week 16. You'll install the Datadog Agent on a Linux server, on Docker, and on Kubernetes, send StudyHub's traces, metrics, and logs, and build dashboards, monitors, and SLOs.

**Timing and cost:** Datadog's [free trial](https://www.datadoghq.com/free-datadog-trial/) lasts 14 days and includes APM, logs, and infrastructure monitoring. **Start it on Week 24, Day 1**, so it covers both weeks. When it ends, the account drops to the free plan (infrastructure metrics for a few hosts, with short retention) unless you pay, so do the APM and log work before Day 14. No credit card is needed for the trial.

**Keep your API key secret.** Store it in an environment variable or a Kubernetes Secret, never in Git.

**Courses for this section (optional, see [resources.md](../resources.md)):** the free [Datadog Learning Center](https://learn.datadoghq.com/) (start with "Datadog Foundation" and "Introduction to APM"), and the [Datadog docs](https://docs.datadoghq.com/).
**roadmap.sh:** [DevOps](https://roadmap.sh/devops) (monitoring and Datadog).

---

## Week 24: Datadog on Linux and Docker

**By the end of the week:** the Datadog Agent on your Ubuntu Server VM and on Docker, with host metrics, Docker container metrics, the Valkey and MongoDB integrations, StudyHub's logs, and a dashboard.

### Day 1: Start the trial, and install the Agent on Linux

**Topic:** the Datadog Agent is a program on each host that collects metrics, logs, and traces and sends them to Datadog. Everything in Datadog is organized by **tags**, such as `env`, `service`, `version`, and `host`.

**Learn (~20 min)**
- [Getting started with Datadog](https://docs.datadoghq.com/getting_started/) and [Getting started with the Agent](https://docs.datadoghq.com/getting_started/agent/)

**Do**
1. Sign up for the [free trial](https://www.datadoghq.com/free-datadog-trial/). Pick the site closest to you (for example `US5` or `EU1`), and note it: the site name goes in every config.
2. Start your Week 4 VM (`multipass start lab1`), open `ssh lab1`, and copy the Ubuntu install command from **Integrations → Agent → Ubuntu** in Datadog. It looks like `DD_API_KEY=<key> DD_SITE="<site>" bash -c "$(curl -L https://install.datadoghq.com/scripts/install_script_agent7.sh)"`.
3. Check it:
   ```bash
   sudo datadog-agent status | head -40
   systemctl status datadog-agent --no-pager
   ```
4. In Datadog, open **Infrastructure → Host Map**, and find `lab1` with its CPU, memory, and disk.

**Done when:** `lab1` reports to Datadog, and `datadog-agent status` shows no errors.

### Day 2: Tags, and monitoring StudyHub's process and logs

**Learn (~15 min)**
- [Getting started with tags](https://docs.datadoghq.com/getting_started/tagging/) and [Host Agent log collection](https://docs.datadoghq.com/agent/logs/)

**Do (in lab1)**
1. Add host tags in `/etc/datadog-agent/datadog.yaml`: `tags: ["env:lab", "team:you"]`.
2. Turn on log collection (`logs_enabled: true`), then collect StudyHub's journald logs with `/etc/datadog-agent/conf.d/journald.d/conf.yaml`:
   ```yaml
   logs:
     - type: journald
       include_units: [studyhub.service]
       service: studyhub-api
       source: csharp
   ```
   Add the `dd-agent` user to the `systemd-journal` group (`sudo usermod -aG systemd-journal dd-agent`), then `sudo systemctl restart datadog-agent`.
3. Add a process check for StudyHub in `conf.d/process.d/conf.yaml` (`instances: [{ name: studyhub, search_string: ["StudyHub.Api"] }]`).
4. Call StudyHub a few times, then find its logs in **Logs → Explorer**, filtered by `service:studyhub-api`.

**Done when:** StudyHub's logs and process appear in Datadog, tagged with `env:lab`.

### Day 3: The Agent on Docker

**Learn (~15 min)**
- [Docker Agent](https://docs.datadoghq.com/containers/docker/) (Datadog docs)

**Do:** add the Agent to your StudyHub `compose.yaml`:
```yaml
  datadog:
    image: gcr.io/datadoghq/agent:7
    environment:
      DD_API_KEY: ${DD_API_KEY}
      DD_SITE: ${DD_SITE}
      DD_ENV: lab
      DD_LOGS_ENABLED: "true"
      DD_LOGS_CONFIG_CONTAINER_COLLECT_ALL: "true"
      DD_HOSTNAME: laptop-docker
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /proc/:/host/proc/:ro
      - /sys/fs/cgroup/:/host/sys/fs/cgroup:ro
```
Put `DD_API_KEY` and `DD_SITE` in `.env` (which must be in `.gitignore`). Start the stack, and open **Infrastructure → Containers**.

**Done when:** every StudyHub container shows in Datadog with its CPU, memory, and logs.

### Day 4: Integrations for Valkey and MongoDB

**Topic:** integrations collect each technology's own metrics: Valkey's hit ratio and memory, MongoDB's operations and connections. In containers, you turn them on with labels, which Datadog calls Autodiscovery.

**Learn (~15 min)**
- [Docker integrations with Autodiscovery](https://docs.datadoghq.com/containers/docker/integrations/), the [Redis integration](https://docs.datadoghq.com/integrations/redis/) (works with Valkey), and the [MongoDB integration](https://docs.datadoghq.com/integrations/mongodb/)

**Do:** add labels to the services in Compose:
```yaml
  valkey:
    labels:
      com.datadoghq.ad.checks: '{"redisdb": {"instances": [{"host": "%%host%%", "port": "6379"}]}}'
  mongo:
    labels:
      com.datadoghq.ad.checks: '{"mongo": {"instances": [{"hosts": ["%%host%%:27017"]}]}}'
```
Recreate the services, run your k6 test, and open the built-in **Redis** and **MongoDB** dashboards.

**Done when:** both built-in dashboards show live data, including Valkey's keyspace hits and misses.

### Day 5: Your own dashboard

**Learn (~15 min)**
- [Dashboards](https://docs.datadoghq.com/dashboards/) (Datadog docs)

**Do:** build a "StudyHub" dashboard with:
- containers' CPU and memory, grouped by service
- Valkey hit ratio (a formula of `redis.stats.keyspace_hits` and `redis.stats.keyspace_misses`)
- MongoDB operations per second
- a log stream filtered to `status:error`
- a template variable for `env`, so the same dashboard works for `lab` and, next week, `k8s`

Export it as JSON into `datadog/dashboards/studyhub.json`.

**Done when:** the dashboard shows StudyHub's health at a glance, and its JSON is saved in Git.

### Day 6: Mini project, compare with Grafana

**Do:** run your Week 16 incident drill (the slow reports) with both Datadog and your Grafana stack running. Write `datadog/COMPARISON.md`:

| | Grafana stack (Week 16) | Datadog |
|---|---|---|
| Setup effort | | |
| Time to find the slow endpoint | | |
| Logs, metrics, and traces linked? | | |
| Cost for 10 hosts | | |
| What you'd recommend for a small team, and for a large company | | |

**Done when:** the table is filled in from your own experience.

### Day 7: Review and catch-up (light)

- Push `datadog/` (with no keys) to `cloud-native-lab/week-24`. Note how many trial days you have left.

---

## Week 25: Datadog for .NET and Kubernetes

**By the end of the week:** StudyHub's traces in Datadog APM, both from Datadog's .NET tracer and from your existing OpenTelemetry setup; the Agent on your kind cluster through the Datadog Operator; and monitors and an SLO that would page you for real problems.

### Day 1: APM with the Datadog .NET tracer

**Topic:** Datadog's .NET tracer instruments ASP.NET Core, HttpClient, MongoDB, Redis, and more automatically. **Unified service tagging** (`env`, `service`, `version`) links traces, logs, and metrics for the same deployment.

**Learn (~20 min)**
- [Tracing .NET Core applications](https://docs.datadoghq.com/tracing/trace_collection/dd_libraries/dotnet-core/) and [Unified service tagging](https://docs.datadoghq.com/getting_started/tagging/unified_service_tagging/)

**Do:** add the tracer to StudyHub's Dockerfile. The chiseled image has no shell, so follow the docs' chiseled-container instructions, which copy the tracer files in with `ADD` and set environment variables:
```dockerfile
ENV CORECLR_ENABLE_PROFILING=1 \
    CORECLR_PROFILER={846F5F1C-F9AE-4B07-969E-05C26BC060D8} \
    CORECLR_PROFILER_PATH=/opt/datadog/Datadog.Trace.ClrProfiler.Native.so \
    DD_DOTNET_TRACER_HOME=/opt/datadog
```
In Compose, set `DD_AGENT_HOST: datadog`, `DD_ENV: lab`, `DD_SERVICE: studyhub-api`, `DD_VERSION: 0.7.0`, and `DD_LOGS_INJECTION: "true"` on the API. On the Agent, set `DD_APM_ENABLED: "true"` and `DD_APM_NON_LOCAL_TRAFFIC: "true"`.

Rebuild, run k6, and open **APM → Services → studyhub-api**.

**Done when:** you see StudyHub's endpoints, their latency and errors, and MongoDB and Redis spans inside each trace.

### Day 2: Or keep OpenTelemetry, and send OTLP to the Agent

**Topic:** you don't have to choose. The Datadog Agent can receive OTLP, so the OpenTelemetry code from Week 15 works unchanged. Many teams prefer this, because it avoids being tied to one vendor.

**Learn (~15 min)**
- [OTLP ingestion by the Datadog Agent](https://docs.datadoghq.com/opentelemetry/setup/otlp_ingest_in_the_agent/)

**Do**
1. Remove the tracer environment variables from the API (keep them in a branch).
2. On the Agent, set `DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_GRPC_ENDPOINT: 0.0.0.0:4317`, `DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_HTTP_ENDPOINT: 0.0.0.0:4318`, and `DD_OTLP_CONFIG_LOGS_ENABLED: "true"`.
3. Point StudyHub's `OTEL_EXPORTER_OTLP_ENDPOINT` at `http://datadog:4317`, and set `OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=lab,service.version=0.7.0`.
4. Check that traces, your `studyhub.cache.*` metrics, and logs appear in Datadog.

**Done when:** the same OpenTelemetry code sends data to Datadog. Write down which approach you'd choose, and why.

### Day 3: The Datadog Operator on Kubernetes

**Learn (~20 min)**
- [Install the Datadog Agent on Kubernetes](https://docs.datadoghq.com/containers/kubernetes/installation/) and [Getting started with the Datadog Operator](https://docs.datadoghq.com/getting_started/containers/datadog_operator/)

**Do:** start your kind cluster from Week 20, then:
```bash
helm repo add datadog https://helm.datadoghq.com && helm repo update
helm install datadog-operator datadog/datadog-operator -n datadog --create-namespace
kubectl create secret generic datadog-secret -n datadog --from-literal api-key=$DD_API_KEY
```
Create `datadog/datadog-agent.yaml`:
```yaml
apiVersion: datadoghq.com/v2alpha1
kind: DatadogAgent
metadata: { name: datadog, namespace: datadog }
spec:
  global:
    clusterName: kind-lab
    site: <your site>
    credentials: { apiSecret: { secretName: datadog-secret, keyName: api-key } }
    kubelet: { tlsVerify: false }          # kind only; never in production
  features:
    apm: { instrumentation: { enabled: false } }
    logCollection: { enabled: true, containerCollectAll: true }
    otlp: { receiver: { protocols: { grpc: { enabled: true } } } }
```
Apply it, then open **Infrastructure → Kubernetes** in Datadog.

**Done when:** the kind cluster, its nodes, pods, and deployments appear in Datadog.

### Day 4: StudyHub on Kubernetes in Datadog

**Do**
1. In your Helm chart, add the unified service tags as pod labels (`tags.datadoghq.com/env`, `tags.datadoghq.com/service`, and `tags.datadoghq.com/version`).
2. Point `OTEL_EXPORTER_OTLP_ENDPOINT` at the Agent on the same node, using the node's IP through the Downward API:
   ```yaml
   env:
     - name: HOST_IP
       valueFrom: { fieldRef: { fieldPath: status.hostIP } }
     - name: OTEL_EXPORTER_OTLP_ENDPOINT
       value: http://$(HOST_IP):4317
   ```
3. Add Autodiscovery annotations to the Valkey and MongoDB pods, as in Week 24 Day 4, in the Kubernetes annotation format from the docs.
4. Run k6 against the Gateway, and use your dashboard with `env:k8s`.

**Done when:** StudyHub on Kubernetes shows traces, logs, and Valkey and MongoDB metrics in Datadog, and the dashboard works for both environments.

### Day 5: Monitors and an SLO

**Learn (~20 min)**
- [Monitors](https://docs.datadoghq.com/monitors/) and [Service Level Objectives](https://docs.datadoghq.com/service_level_objectives/)

**Do**
1. Create three monitors, each with a clear message saying what to check first:
   - APM: `studyhub-api` error rate above 5% for 5 minutes
   - Metric: Valkey hit ratio below 50% for 10 minutes
   - Kubernetes: any StudyHub pod in `CrashLoopBackOff`
2. Create an SLO: 99% of requests to `/lessons` succeed in under 500 ms, over 7 days.
3. Trigger each monitor on purpose (stop MongoDB, clear the cache in a loop, and deploy a broken image), and check the alert email arrives and then resolves.

**Done when:** each monitor has fired and resolved once, and the SLO shows its error budget.

### Day 6: Mini project, clean up and write it up

**Do**
1. Export your monitors and dashboard as JSON into `datadog/`, so you could recreate them in another account.
2. Write `datadog/README.md`: how the Agent is installed on Linux, Docker, and Kubernetes; the OpenTelemetry-versus-tracer decision; the tags you use; and the monitors and SLO, with what each one means.
3. Before the trial ends: uninstall the Agent from `lab1` (`sudo apt remove datadog-agent`), remove it from Compose, and `helm uninstall datadog-operator -n datadog`. Rotate (revoke) the API key you used.

**Done when:** the write-up is done, nothing is still sending data, and the API key is revoked.

### Day 7: Review and catch-up (light)

- Push `datadog/` to `cloud-native-lab/week-25`. Section H is complete. Mark the topics on [roadmap.sh/devops](https://roadmap.sh/devops).
