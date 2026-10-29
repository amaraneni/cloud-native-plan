# Section C: Caching in .NET (Weeks 8–10)

Caching is the cheapest way to make a service faster and to protect its database. These weeks cover every layer .NET offers: in-process (`IMemoryCache`), whole responses (output caching and HTTP caching), shared between instances (`IDistributedCache` with Valkey), and both together (`HybridCache`). You'll measure each change rather than guess.

**Valkey or Redis?** Valkey is the open-source fork of Redis, run by the Linux Foundation. It speaks the same protocol, so the .NET Redis libraries work with it unchanged. AWS ElastiCache, which you'll use in Week 22, offers Valkey at a lower price than Redis.

**Courses for this section (optional, see [resources.md](../resources.md)):** Microsoft Learn's [caching overview](https://learn.microsoft.com/en-us/aspnet/core/performance/caching/overview), and AlgoMaster's [System Design](https://algomaster.io/learn/system-design) caching lessons for the patterns.
**roadmap.sh:** [ASP.NET Core](https://roadmap.sh/aspnet-core) (caching topics), [Redis](https://roadmap.sh/redis), and [System Design](https://roadmap.sh/system-design) (caching).

---

## Week 8: In-process caching

**By the end of the week:** StudyHub with a slow data source, a load test that measures it, and three kinds of caching (IMemoryCache, output caching, and HTTP caching), each with before and after numbers.

### Day 1: A slow data source, and a way to measure it

**Topic:** you can't improve what you don't measure. Before caching anything, give StudyHub a realistically slow data source and a simple load test.

**Learn (~15 min)**
- [Caching overview](https://learn.microsoft.com/en-us/aspnet/core/performance/caching/overview) (Microsoft Learn)

**Do**
1. In `StudyHub.Api`, add a repository that pretends to be a slow database:
   ```csharp
   public interface ILessonRepository
   {
       Task<IReadOnlyList<Lesson>> GetAllAsync(CancellationToken ct = default);
       Task<Lesson?> GetAsync(int id, CancellationToken ct = default);
   }

   public sealed class SlowLessonRepository : ILessonRepository
   {
       private static readonly Lesson[] Lessons = Enumerable.Range(1, 50)
           .Select(i => new Lesson(i, $"Lesson {i}", i % 2 == 0 ? "linux" : "docker")).ToArray();
       public static int Calls;   // counts "database" calls

       public async Task<IReadOnlyList<Lesson>> GetAllAsync(CancellationToken ct = default)
       { Interlocked.Increment(ref Calls); await Task.Delay(300, ct); return Lessons; }

       public async Task<Lesson?> GetAsync(int id, CancellationToken ct = default)
       { Interlocked.Increment(ref Calls); await Task.Delay(150, ct); return Lessons.FirstOrDefault(l => l.Id == id); }
   }
   ```
2. Register it with `builder.Services.AddSingleton<ILessonRepository, SlowLessonRepository>();`, make `/lessons` and `/lessons/{id}` use it, and add `app.MapGet("/stats", () => new { dbCalls = SlowLessonRepository.Calls });`.
3. Install the k6 load tester from the [k6 install page](https://grafana.com/docs/k6/latest/set-up/install-k6/) (on Ubuntu, use the apt instructions there), and save this as `load.js`:
   ```javascript
   import http from "k6/http";
   export const options = { vus: 20, duration: "30s" };
   export default function () {
     http.get(`http://localhost:5080/lessons/${Math.ceil(Math.random() * 50)}`);
     http.get("http://localhost:5080/lessons");
   }
   ```
4. Run StudyHub, then `k6 run load.js`. Record requests per second, p95 latency, and `/stats`.

**Done when:** you have baseline numbers written down in `caching/RESULTS.md`.

### Day 2: IMemoryCache and cache-aside

**Topic:** cache-aside means: look in the cache, and on a miss, load from the source and store it. `IMemoryCache` keeps objects in the app's own memory, so it's very fast but not shared between instances.

**Learn (~20 min)**
- [Cache in-memory in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/performance/caching/memory) (Microsoft Learn)

**Do:** add a caching decorator around the repository:
```csharp
using Microsoft.Extensions.Caching.Memory;

public sealed class MemoryCachedLessonRepository(ILessonRepository inner, IMemoryCache cache) : ILessonRepository
{
    public Task<IReadOnlyList<Lesson>> GetAllAsync(CancellationToken ct = default) =>
        cache.GetOrCreateAsync("lessons:all", entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30);
            return inner.GetAllAsync(ct);
        })!;

    public Task<Lesson?> GetAsync(int id, CancellationToken ct = default) =>
        cache.GetOrCreateAsync($"lessons:{id}", entry =>
        {
            entry.SlidingExpiration = TimeSpan.FromSeconds(20);
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(2);
            return inner.GetAsync(id, ct);
        });
}
```
Register it:
```csharp
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<SlowLessonRepository>();
builder.Services.AddSingleton<ILessonRepository>(sp =>
    new MemoryCachedLessonRepository(sp.GetRequiredService<SlowLessonRepository>(), sp.GetRequiredService<IMemoryCache>()));
```
Run the load test again.

**Done when:** throughput is much higher, `/stats` shows far fewer database calls, and both results are in `RESULTS.md`.

### Day 3: Expiration, size limits, and the stampede problem

**Topic:** an unbounded cache can use all your memory. And when a popular entry expires, many requests can miss at the same time and all hit the database. That's a **cache stampede**.

**Do**
1. Set a size limit: `builder.Services.AddMemoryCache(o => o.SizeLimit = 1000);`, then give every entry a size with `entry.Size = 1;` (it's required once a limit is set).
2. Reproduce a stampede: set `lessons:all` to expire after 2 seconds, run k6 with 50 users, and watch `/stats` jump every time it expires.
3. Note in `RESULTS.md` that `GetOrCreateAsync` on `IMemoryCache` **doesn't** stop concurrent misses. You'll fix this properly with HybridCache in Week 10.

**Done when:** you've seen the stampede in the numbers, and explained it in your notes.

### Day 4: Output caching

**Topic:** output caching stores the whole HTTP response on the server, so the endpoint code doesn't even run. You can vary it by query string and clear it by tag.

**Learn (~20 min)**
- [Output caching middleware in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/performance/caching/output) (Microsoft Learn)

**Do**
```csharp
builder.Services.AddOutputCache(o =>
{
    o.AddBasePolicy(b => b.Expire(TimeSpan.FromSeconds(10)));
    o.AddPolicy("lessons", b => b.Expire(TimeSpan.FromMinutes(1)).SetVaryByQuery("topic").Tag("lessons"));
});
app.UseOutputCache();

app.MapGet("/lessons", async (ILessonRepository repo, string? topic) =>
    (await repo.GetAllAsync()).Where(l => topic is null || l.Topic == topic))
   .CacheOutput("lessons");

app.MapPost("/admin/lessons/refresh", async (IOutputCacheStore store, CancellationToken ct) =>
{
    await store.EvictByTagAsync("lessons", ct);
    return Results.NoContent();
});
```
Turn off your memory cache decorator for this test, so you see output caching alone. Run k6, then call the refresh endpoint and check the next request is slow again.

**Done when:** you've measured output caching, and evicted it by tag.

### Day 5: HTTP caching with ETags and Cache-Control

**Topic:** HTTP caching lets browsers and proxies keep responses. `Cache-Control` says for how long. An `ETag` lets a client ask "has it changed?", and get a tiny `304 Not Modified` if it hasn't.

**Learn (~20 min)**
- [HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching) (MDN)

**Do:** add an ETag to the single-lesson endpoint:
```csharp
app.MapGet("/lessons/{id:int}", async (int id, ILessonRepository repo, HttpContext http) =>
{
    var lesson = await repo.GetAsync(id);
    if (lesson is null) return Results.NotFound();
    var etag = $"\"{lesson.GetHashCode():x}\"";
    http.Response.Headers.ETag = etag;
    http.Response.Headers.CacheControl = "public, max-age=60";
    return http.Request.Headers.IfNoneMatch == etag ? Results.StatusCode(304) : Results.Ok(lesson);
});
```
Test it:
```bash
curl -si localhost:5080/lessons/3 | grep -i -E 'etag|cache-control'
curl -si -H 'If-None-Match: "<the etag>"' localhost:5080/lessons/3 | head -1   # HTTP/1.1 304
```

**Done when:** a repeat request with the ETag returns `304` and no body.

### Day 6: Mini project, the caching comparison

**Do:** fill in `caching/RESULTS.md` with one row per approach, all measured with the same k6 script:

| Approach | Requests/s | p95 latency | Database calls in 30s | Shared between instances? | Survives a restart? |
|---|---|---|---|---|---|
| No cache | | | | | |
| IMemoryCache | | | | No | No |
| Output cache | | | | No | No |
| HTTP caching (client side) | | | | n/a | n/a |

Then write three sentences on when you'd use each one.

**Done when:** the table is filled in with your own numbers.

### Day 7: Review and catch-up (light)

- Push StudyHub and `RESULTS.md` to `cloud-native-lab/week-08`.

---

## Week 9: Distributed caching with Valkey

**By the end of the week:** two StudyHub instances sharing a Valkey cache through `IDistributedCache`, an output cache stored in Valkey, and the skills to inspect any Redis-compatible cache with `valkey-cli`.

### Day 1: Why distributed caching

**Topic:** with two or more instances, each has its own memory cache. They disagree, each warms up separately, and an update on one doesn't reach the other. A distributed cache is one shared store for all instances.

**Learn (~20 min)**
- [Distributed caching in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/performance/caching/distributed) (Microsoft Learn)

**Do:** prove the problem. Add `app.MapGet("/whoami", () => Environment.MachineName);`, run two API copies behind nginx in Compose (from Week 7 Day 4), and add a `POST /lessons/{id}/title` endpoint that changes a title and removes that key from the memory cache. Call it, then fetch the lesson several times through nginx.

**Done when:** you've seen different instances return different titles for the same lesson.

### Day 2: Valkey basics with valkey-cli

**Learn (~20 min)**
- [Valkey command reference](https://valkey.io/commands/): `SET`, `GET`, `EXPIRE`, `TTL`, `DEL`, `SCAN`, `INFO`

**Do:** use the Valkey container from your Compose file:
```bash
docker compose exec valkey valkey-cli
SET greeting "hello" EX 30
GET greeting
TTL greeting
SET lesson:1 '{"id":1,"title":"Install WSL"}'
KEYS *                       # fine locally; never on a real server
SCAN 0 MATCH lesson:* COUNT 100
INFO memory
INFO stats                   # keyspace_hits and keyspace_misses
CONFIG GET maxmemory-policy
MONITOR                      # watch every command live; Ctrl+C to stop
```

**Done when:** you can set a value with an expiry, find keys safely with `SCAN`, and read the hit and miss counters.

### Day 3: IDistributedCache with Valkey

**Learn (~15 min)**
- [Distributed Redis cache](https://learn.microsoft.com/en-us/aspnet/core/performance/caching/distributed#distributed-redis-cache) (Microsoft Learn)

**Do**
1. `dotnet add package Microsoft.Extensions.Caching.StackExchangeRedis`
2. Register it, using the connection string from Compose:
   ```csharp
   builder.Services.AddStackExchangeRedisCache(o =>
   {
       o.Configuration = builder.Configuration.GetConnectionString("Valkey");
       o.InstanceName = "studyhub:";
   });
   ```
3. Write a `DistributedCachedLessonRepository` that serializes with `System.Text.Json`:
   ```csharp
   public sealed class DistributedCachedLessonRepository(ILessonRepository inner, IDistributedCache cache) : ILessonRepository
   {
       private static readonly DistributedCacheEntryOptions Options = new() { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5) };

       public async Task<Lesson?> GetAsync(int id, CancellationToken ct = default)
       {
           string key = $"lessons:{id}";
           var cached = await cache.GetStringAsync(key, ct);
           if (cached is not null) return JsonSerializer.Deserialize<Lesson>(cached);
           var lesson = await inner.GetAsync(id, ct);
           if (lesson is not null) await cache.SetStringAsync(key, JsonSerializer.Serialize(lesson), Options, ct);
           return lesson;
       }

       public async Task<IReadOnlyList<Lesson>> GetAllAsync(CancellationToken ct = default)
       {
           var cached = await cache.GetStringAsync("lessons:all", ct);
           if (cached is not null) return JsonSerializer.Deserialize<List<Lesson>>(cached)!;
           var all = await inner.GetAllAsync(ct);
           await cache.SetStringAsync("lessons:all", JsonSerializer.Serialize(all), Options, ct);
           return all;
       }

       public Task RemoveAsync(int id, CancellationToken ct = default) =>
           Task.WhenAll(cache.RemoveAsync($"lessons:{id}", ct), cache.RemoveAsync("lessons:all", ct));
   }
   ```
4. Make the title-change endpoint call `RemoveAsync`, and repeat Day 1's test.

**Done when:** both instances return the same, updated title. Look in `valkey-cli` with `SCAN 0 MATCH studyhub:*`, and note that the library stores values as hashes.

### Day 4: Output cache and sessions in Valkey

**Learn (~15 min)**
- [Output caching: Redis-based store](https://learn.microsoft.com/en-us/aspnet/core/performance/caching/output#redis-based-output-cache-store) (Microsoft Learn)

**Do**
1. `dotnet add package Microsoft.AspNetCore.OutputCaching.StackExchangeRedis`, then:
   ```csharp
   builder.Services.AddStackExchangeRedisOutputCache(o =>
   {
       o.Configuration = builder.Configuration.GetConnectionString("Valkey");
       o.InstanceName = "studyhub-oc:";
   });
   ```
2. With two instances, call the tag-eviction endpoint from Week 8 on one instance, and check both now miss.
3. Add session state backed by the same distributed cache (`builder.Services.AddSession()` and `app.UseSession()`), store a "last viewed lesson" in the session, and check it follows you across instances.

**Done when:** eviction and sessions work across both instances.

### Day 5: Keys, TTLs, serialization, and memory

**Topic:** good cache keys are predictable and versioned (`studyhub:v1:lessons:3`). Every entry needs a TTL. When memory fills, `maxmemory-policy` decides what's evicted.

**Learn (~15 min)**
- [Key eviction](https://valkey.io/topics/lru-cache/) (Valkey docs)

**Do**
1. Add a version segment to all keys, so a deploy that changes the `Lesson` shape can switch to `v2` without reading old data.
2. Start Valkey with a 2 MB limit and LRU eviction: add `command: ["valkey-server", "--maxmemory", "2mb", "--maxmemory-policy", "allkeys-lru"]` to the service in Compose.
3. Fill it with a script (`for i in $(seq 1 20000); do echo "SET junk:$i $(head -c 200 /dev/urandom | base64 -w0)"; done | docker compose exec -T valkey valkey-cli > /dev/null`), then check `INFO stats` for `evicted_keys`.
4. Compare the size of a lesson stored as JSON with one stored using `JsonSerializer` source generation (`[JsonSerializable(typeof(Lesson))]`), using `MEMORY USAGE <key>`.

**Done when:** you've seen evictions happen, and your keys are versioned.

### Day 6: When the cache is down

**Topic:** a cache must never take your service down. If Valkey is unreachable, StudyHub should still answer from the database, just more slowly.

**Do**
1. Stop Valkey with `docker compose stop valkey`, and call the API. Note what happens (it waits for timeouts, then errors).
2. Make the repository fall back: wrap cache calls in `try`/`catch (RedisConnectionException)` and `catch (RedisTimeoutException)`, log a warning, and go to the database.
3. Shorten the connection timeouts in the configuration string, for example `valkey:6379,connectTimeout=1000,syncTimeout=500,abortConnect=false`.
4. Run k6 while you stop and start Valkey, and record the error rate.

**Done when:** stopping Valkey makes StudyHub slower, but never return errors.

### Day 7: Review and catch-up (light)

- Push to `cloud-native-lab/week-09`, and add the distributed cache row to `RESULTS.md`.

---

## Week 10: HybridCache, invalidation, and cache design

**By the end of the week:** StudyHub using `HybridCache`, with in-memory and Valkey layers, stampede protection, and tag-based invalidation, plus a written caching design you could defend in a review.

### Day 1: What HybridCache adds

**Topic:** `HybridCache` combines a fast in-memory layer (L1) with a distributed layer (L2). It protects against stampedes (only one caller loads a missing key), handles serialization, and supports tags. It replaces most hand-written cache-aside code.

**Learn (~20 min)**
- [HybridCache library in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid) (Microsoft Learn)

**Do:** read the page, then list which of your Week 8–9 problems HybridCache solves: the stampede, the extra serialization code, the per-instance memory cache, and invalidation.

**Done when:** you can explain L1, L2, and stampede protection in your own words.

### Day 2: Switch StudyHub to HybridCache

**Do**
1. `dotnet add package Microsoft.Extensions.Caching.Hybrid`
2. Register it. Keep the `AddStackExchangeRedisCache` call from Week 9, and HybridCache uses it as L2 automatically:
   ```csharp
   builder.Services.AddHybridCache(o =>
   {
       o.DefaultEntryOptions = new HybridCacheEntryOptions
       {
           Expiration = TimeSpan.FromMinutes(5),       // L2 (Valkey)
           LocalCacheExpiration = TimeSpan.FromMinutes(1)  // L1 (memory)
       };
   });
   ```
3. Replace the decorator with a much shorter one:
   ```csharp
   public sealed class HybridCachedLessonRepository(ILessonRepository inner, HybridCache cache) : ILessonRepository
   {
       public async Task<Lesson?> GetAsync(int id, CancellationToken ct = default) =>
           await cache.GetOrCreateAsync($"v1:lessons:{id}",
               async token => await inner.GetAsync(id, token),
               tags: ["lessons", $"lesson:{id}"], cancellationToken: ct);

       public async Task<IReadOnlyList<Lesson>> GetAllAsync(CancellationToken ct = default) =>
           await cache.GetOrCreateAsync("v1:lessons:all",
               async token => await inner.GetAllAsync(token),
               tags: ["lessons"], cancellationToken: ct);
   }
   ```

**Done when:** StudyHub works on HybridCache, and the decorator is about half the size of the Week 9 one.

### Day 3: Stampede protection, measured

**Do:** repeat Week 8 Day 3's stampede test. Set a 2-second expiry, run k6 with 50 users, and compare `/stats` database calls with the IMemoryCache version.

**Done when:** each expiry causes one database call per instance, not dozens. Record both numbers in `RESULTS.md`.

### Day 4: Invalidation with tags

**Topic:** "There are only two hard things in computer science: cache invalidation and naming things." Tags let you invalidate groups of entries at once. In HybridCache this is a logical operation: old entries are ignored rather than deleted.

**Do**
1. On title change, call `await cache.RemoveByTagAsync($"lesson:{id}")` and `await cache.RemoveByTagAsync("lessons")`.
2. Add `POST /admin/cache/clear`, which calls `RemoveByTagAsync("*")`.
3. With two instances, change a title on one and read it through the other. In current versions, L1 on the other instance can stay stale until `LocalCacheExpiration` runs out. Measure how long, and decide whether one minute is acceptable for StudyHub.

**Done when:** you've measured the staleness window across instances, and written down your decision.

### Day 5: Cache design patterns

**Learn (~25 min)**
- AlgoMaster's [System Design](https://algomaster.io/learn/system-design) caching lessons: cache-aside, write-through, write-behind, and refresh-ahead

**Do:** for each StudyHub data type, pick a pattern and an expiry, and write the reason:

| Data | Changes how often | Pattern | L1 expiry | L2 expiry | Invalidation |
|---|---|---|---|---|---|
| Lesson list | Rarely | | | | |
| One lesson | Rarely | | | | |
| A user's progress | Every study session | | | | |
| Leaderboard | Every minute | | | | |

**Done when:** the table is filled in, and at least one row says "don't cache", with a reason.

### Day 6: Mini project, the caching design document

**Do:** write `caching/DESIGN.md` for StudyHub, covering:
- the layers you use (HTTP, output cache, HybridCache L1 and L2) and what each one is for
- key naming and versioning
- expiry and invalidation rules (from Day 5)
- what happens when Valkey is down (Week 9 Day 6)
- the numbers from `RESULTS.md`
- what you'd monitor: hit ratio, evictions, memory, and latency. You'll add these as metrics in Week 15.

**Done when:** a teammate could read the document and know exactly how StudyHub caches.

### Day 7: Review and catch-up (light)

- Push to `cloud-native-lab/week-10`. Section C is complete. Mark the caching topics on [roadmap.sh/aspnet-core](https://roadmap.sh/aspnet-core) and [roadmap.sh/redis](https://roadmap.sh/redis).
