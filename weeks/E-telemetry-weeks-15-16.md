# Section E: Telemetry with OpenTelemetry (Weeks 15–16)

Telemetry is how you know what your service is doing: **traces** follow one request across services, **metrics** count and measure over time, and **logs** record events. OpenTelemetry (OTel) is the open standard for all three. You'll add it to StudyHub once, then send the same data to the Aspire dashboard now, to Grafana and Jaeger next week, and to Datadog in Week 25, without changing the app's code.

**Courses for this section (optional, see [resources.md](../resources.md)):** the [OpenTelemetry .NET docs](https://opentelemetry.io/docs/languages/dotnet/), and Microsoft Learn's [.NET observability with OpenTelemetry](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/observability-with-otel).
**roadmap.sh:** [DevOps](https://roadmap.sh/devops) (observability, OpenTelemetry, Prometheus, and Grafana) and [Backend](https://roadmap.sh/backend) (telemetry).

---

## Week 15: OpenTelemetry in .NET

**By the end of the week:** StudyHub and its worker sending traces, metrics, and logs over OTLP, with your own spans and cache metrics, and one trace that follows a request from the API, through Valkey, to the worker.

### Day 1: The three signals

**Topic:** in .NET, traces are made with `ActivitySource` and `Activity`, metrics with `Meter`, and logs with `ILogger`. The OpenTelemetry SDK collects all three and exports them over OTLP.

**Learn (~25 min)**
- [.NET observability with OpenTelemetry](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/observability-with-otel) (Microsoft Learn)
- [OpenTelemetry concepts: signals](https://opentelemetry.io/docs/concepts/signals/)

**Do:** for one `GET /reports/topics` request, write down what you'd want to know, and which signal records it: how long each step took, how many requests failed per minute, the error message when MongoDB times out, and the cache hit ratio.

**Done when:** you can say which signal answers each question.

### Day 2: Add OpenTelemetry to StudyHub

**Learn (~15 min)**
- [Standalone Aspire dashboard](https://aspire.dev/dashboard/standalone/)

**Do**
1. Add the Aspire dashboard to Compose:
   ```yaml
   aspire:
     image: mcr.microsoft.com/dotnet/aspire-dashboard:latest
     ports: ["18888:18888"]
     environment:
       ASPIRE_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS: "true"   # local use only
   ```
2. Add the packages:
   ```bash
   dotnet add package OpenTelemetry.Extensions.Hosting
   dotnet add package OpenTelemetry.Exporter.OpenTelemetryProtocol
   dotnet add package OpenTelemetry.Instrumentation.AspNetCore
   dotnet add package OpenTelemetry.Instrumentation.Http
   dotnet add package OpenTelemetry.Instrumentation.Runtime
   ```
3. Register OpenTelemetry:
   ```csharp
   builder.Services.AddOpenTelemetry()
       .ConfigureResource(r => r.AddService("studyhub-api", serviceVersion: "0.5.0"))
       .WithTracing(t => t.AddAspNetCoreInstrumentation().AddHttpClientInstrumentation().AddSource("StudyHub").AddOtlpExporter())
       .WithMetrics(m => m.AddAspNetCoreInstrumentation().AddRuntimeInstrumentation().AddMeter("StudyHub").AddOtlpExporter())
       .WithLogging(l => l.AddOtlpExporter());
   ```
4. In Compose, set `OTEL_EXPORTER_OTLP_ENDPOINT: http://aspire:18889` on the API.
5. Open `http://localhost:18888`, call a few endpoints, and look at Traces, Metrics, and Structured logs.

**Done when:** requests appear as traces, ASP.NET Core metrics appear, and logs show up with their trace IDs.

### Day 3: Your own spans

**Topic:** automatic instrumentation shows HTTP requests. Your own spans show the steps inside them, such as the cache lookup, the database call, and the report calculation.

**Learn (~15 min)**
- [Adding distributed tracing instrumentation](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-instrumentation-walkthroughs) (Microsoft Learn)

**Do:** create one `ActivitySource`, and wrap the repository and report steps:
```csharp
public static class Telemetry
{
    public static readonly ActivitySource Source = new("StudyHub");
}

public async Task<Lesson?> GetAsync(int id, CancellationToken ct = default)
{
    using var activity = Telemetry.Source.StartActivity("mongo.lessons.get");
    activity?.SetTag("db.system", "mongodb");
    activity?.SetTag("studyhub.lesson_id", id);
    var doc = await _lessons.Find(l => l.Id == id).FirstOrDefaultAsync(ct);
    activity?.SetTag("studyhub.found", doc is not null);
    return doc?.ToLesson();
}
```
Do the same for the aggregation report, the DynamoDB put, and the leaderboard update.

**Done when:** one request's trace shows your spans nested inside the HTTP span, with their tags.

### Day 4: Metrics for the cache

**Topic:** a cache you can't measure is a guess. Count hits and misses, and time the source calls.

**Learn (~15 min)**
- [Creating metrics](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/metrics-instrumentation) (Microsoft Learn)

**Do:** HybridCache calls your factory only on a miss, so count requests and factory calls:
```csharp
public static class CacheMetrics
{
    private static readonly Meter Meter = new("StudyHub");
    public static readonly Counter<long> Requests = Meter.CreateCounter<long>("studyhub.cache.requests");
    public static readonly Counter<long> Misses = Meter.CreateCounter<long>("studyhub.cache.misses");
    public static readonly Histogram<double> SourceMs = Meter.CreateHistogram<double>("studyhub.source.duration", unit: "ms");
}

// In the HybridCache decorator:
CacheMetrics.Requests.Add(1, new KeyValuePair<string, object?>("cache.key_type", "lesson"));
return await cache.GetOrCreateAsync(key, async token =>
{
    CacheMetrics.Misses.Add(1, new KeyValuePair<string, object?>("cache.key_type", "lesson"));
    var sw = Stopwatch.StartNew();
    try { return await inner.GetAsync(id, token); }
    finally { CacheMetrics.SourceMs.Record(sw.Elapsed.TotalMilliseconds); }
}, tags: ["lessons", $"lesson:{id}"], cancellationToken: ct);
```
Run your k6 test from Week 8, and find both counters in the dashboard.

**Done when:** you can read the hit ratio (1 − misses ÷ requests) from your own metrics.

### Day 5: Traces across services, including the stream

**Topic:** the trace context travels in the `traceparent` header over HTTP automatically. Across a Valkey stream, nothing carries it for you, so you put it in the message yourself.

**Learn (~15 min)**
- [Context propagation](https://opentelemetry.io/docs/concepts/context-propagation/) (OpenTelemetry docs)

**Do**
1. When adding the stream event, also add the trace context: `new("traceparent", Activity.Current?.Id ?? "")`.
2. In the worker, start a span linked to it:
   ```csharp
   var parent = e["traceparent"].ToString();
   ActivityContext.TryParse(parent, null, out var ctx);
   using var activity = Telemetry.Source.StartActivity("stream.process", ActivityKind.Consumer, ctx);
   ```
3. Add OpenTelemetry to the worker (service name `studyhub-worker`), and point it at the same dashboard.

**Done when:** one trace shows the API request and the worker's processing of its event, across both services.

### Day 6: Mini project, logging that helps

**Do**
1. Use structured logging everywhere: `logger.LogInformation("Session saved for {User}, {Minutes} min", user, minutes)`, never string concatenation.
2. Add `[LoggerMessage]` source-generated log methods for the three most frequent messages.
3. Set log levels in `appsettings.json` so framework noise is `Warning` and StudyHub is `Information`.
4. Cause an error (stop MongoDB) and find, in the dashboard, the failing trace, its exception, and the matching log lines, all linked by trace ID.

**Done when:** you can go from an error log to its full trace, and back, in a few clicks.

### Day 7: Review and catch-up (light)

- Push to `cloud-native-lab/week-15`.

---

## Week 16: An open-source observability stack

**By the end of the week:** the OpenTelemetry Collector routing StudyHub's data to Jaeger (traces), Prometheus (metrics), and Loki (logs), all shown in Grafana, with a dashboard and an alert.

### Day 1: The OpenTelemetry Collector

**Topic:** the Collector sits between your apps and your back ends. Apps send everything to it, and it batches, filters, and forwards to one or many destinations. Swapping a back end becomes a config change instead of a code change.

**Learn (~20 min)**
- [Collector: configuration](https://opentelemetry.io/docs/collector/configuration/) (OpenTelemetry docs)

**Do:** add the Collector to Compose, with a config that forwards to the Aspire dashboard and also prints to its own log:
```yaml
# otel-collector.yaml
receivers:
  otlp:
    protocols: { grpc: { endpoint: 0.0.0.0:4317 }, http: { endpoint: 0.0.0.0:4318 } }
processors:
  batch: {}
exporters:
  debug: { verbosity: basic }
  otlp/aspire: { endpoint: aspire:18889, tls: { insecure: true } }
service:
  pipelines:
    traces:  { receivers: [otlp], processors: [batch], exporters: [debug, otlp/aspire] }
    metrics: { receivers: [otlp], processors: [batch], exporters: [debug, otlp/aspire] }
    logs:    { receivers: [otlp], processors: [batch], exporters: [debug, otlp/aspire] }
```
```yaml
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes: ["./otel-collector.yaml:/etc/otelcol/config.yaml:ro"]
```
Change the apps' `OTEL_EXPORTER_OTLP_ENDPOINT` to `http://otel-collector:4317`.

**Done when:** data still reaches the dashboard, now through the Collector, and `docker compose logs otel-collector` shows it passing through.

### Day 2: Traces in Jaeger

**Learn (~10 min)**
- [Jaeger getting started](https://www.jaegertracing.io/docs/latest/getting-started/)

**Do:** add Jaeger, and send traces to it from the Collector:
```yaml
  jaeger:
    image: jaegertracing/jaeger:latest
    ports: ["16686:16686"]
```
In the Collector, add `otlp/jaeger: { endpoint: jaeger:4317, tls: { insecure: true } }` to the exporters and to the traces pipeline. Open `http://localhost:16686`, find a `studyhub-api` trace, and use the **Compare** view on a fast and a slow request.

**Done when:** you can find the slowest span in a slow request in Jaeger.

### Day 3: Metrics in Prometheus

**Learn (~15 min)**
- [Prometheus: getting started](https://prometheus.io/docs/prometheus/latest/getting_started/) and the basics of [PromQL](https://prometheus.io/docs/prometheus/latest/querying/basics/)

**Do**
1. In the Collector, add a Prometheus exporter, `prometheus: { endpoint: 0.0.0.0:8889 }`, to the metrics pipeline.
2. Add Prometheus to Compose with a `prometheus.yml` that scrapes `otel-collector:8889` every 15 seconds.
3. In `http://localhost:9090`, run these queries. The Collector converts dots in metric names to underscores:
   ```text
   rate(studyhub_cache_requests_total[1m])
   1 - (rate(studyhub_cache_misses_total[5m]) / rate(studyhub_cache_requests_total[5m]))
   histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket[5m])))
   ```

**Done when:** you can see the cache hit ratio and p95 latency as numbers in Prometheus.

### Day 4: Logs in Loki, and Grafana for everything

**Learn (~15 min)**
- [Ingesting OpenTelemetry logs to Loki](https://grafana.com/docs/loki/latest/send-data/otel/) (Grafana docs)

**Do**
1. Add Loki (`grafana/loki:latest`, port 3100) and Grafana (`grafana/grafana:latest`, port 3000).
2. In the Collector, add an exporter `otlphttp/loki: { endpoint: http://loki:3100/otlp }` to the logs pipeline.
3. In Grafana (`admin`/`admin` on first login), add data sources for Prometheus, Loki, and Jaeger. Better still, put them in a provisioning file under `grafana/provisioning/datasources/` so they survive a rebuild.
4. In **Explore**, find StudyHub's logs in Loki, and click through from a log line's trace ID to the trace in Jaeger (set up "Derived fields" on the Loki data source).

**Done when:** logs, metrics, and traces are all in Grafana, and you can jump from a log to its trace.

### Day 5: A dashboard and an alert

**Learn (~15 min)**
- [Grafana dashboards](https://grafana.com/docs/grafana/latest/visualizations/dashboards/) and [Grafana alerting](https://grafana.com/docs/grafana/latest/alerting/)

**Do**
1. Build a "StudyHub" dashboard with panels for requests per second, p95 latency, error rate (5xx), cache hit ratio, and a logs panel filtered to errors.
2. Export it as JSON into `grafana/dashboards/studyhub.json`, and provision it, so it loads automatically.
3. Create an alert rule: cache hit ratio below 50% for 5 minutes. Trigger it by calling `POST /admin/cache/clear` in a loop while k6 runs.

**Done when:** the dashboard loads automatically on a fresh `docker compose up`, and the alert fires and then resolves.

### Day 6: Mini project, an incident drill

**Do:** break something without looking at the code, then find it using only Grafana:
1. Add `await Task.Delay(Random.Shared.Next(0, 800))` inside the MongoDB report query, behind a setting `Chaos:SlowReports=true`.
2. Turn it on, and run k6.
3. From the dashboard, find which endpoint got slow. From the trace, find which span. From the logs, find when it started.

Write `telemetry/INCIDENT-01.md` with what you saw, how you found it, and how long each step took.

**Done when:** you found the cause from telemetry alone, and wrote it up.

### Day 7: Review and catch-up (light)

- Push `compose.yaml`, the Collector config, and the Grafana files to `cloud-native-lab/week-16`. Section E is complete. Mark the topics on [roadmap.sh/devops](https://roadmap.sh/devops).
