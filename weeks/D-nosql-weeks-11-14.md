# Section D: NoSQL databases (Weeks 11–14)

NoSQL isn't one thing. Valkey is an in-memory data-structure store, MongoDB is a document database, and DynamoDB is a key-value and wide-column database with predictable performance at any scale. You'll use each one from C# for a real part of StudyHub, then write down when to choose which.

Everything runs locally in Docker, including DynamoDB Local, so this section costs nothing.

**Courses for this section (optional, see [resources.md](../resources.md)):** MongoDB University's free [MongoDB C# Developer Path](https://learn.mongodb.com/learning-paths/using-mongodb-with-c-sharp), Redis University's free [courses](https://university.redis.io/), and the [DynamoDB developer guide](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html).
**roadmap.sh:** [Redis](https://roadmap.sh/redis), [MongoDB](https://roadmap.sh/mongodb), and [Backend](https://roadmap.sh/backend) (NoSQL databases).

---

## Week 11: Valkey as a data store

**By the end of the week:** a StudyHub leaderboard and streak counters in Valkey, a stream of study events, and an understanding of how Valkey keeps data safe on disk.

### Day 1: Data types beyond strings

**Topic:** Valkey has strings, hashes, lists, sets, sorted sets, streams, and more. Picking the right type often replaces a database query with a single fast command.

**Learn (~20 min)**
- [Valkey data types](https://valkey.io/topics/data-types/)

**Do (`docker compose exec valkey valkey-cli`)**
```text
HSET user:1 name "Kamal" streak 0 lessonsDone 0
HINCRBY user:1 lessonsDone 1
HGETALL user:1
LPUSH user:1:recent "lesson:3" "lesson:7"
LRANGE user:1:recent 0 -1
SADD user:1:topics linux docker linux
SMEMBERS user:1:topics
ZADD leaderboard 12 user:1 30 user:2 7 user:3
ZREVRANGE leaderboard 0 2 WITHSCORES
ZINCRBY leaderboard 5 user:3
ZREVRANK leaderboard user:1
```

**Done when:** you've used hashes, lists, sets, and sorted sets, and can say which one fits a leaderboard and why.

### Day 2: StackExchange.Redis from C#

**Topic:** `IDistributedCache` only does get and set. For data structures, use StackExchange.Redis directly, which works with Valkey unchanged. Create one `ConnectionMultiplexer` and share it for the app's whole life.

**Learn (~15 min)**
- [StackExchange.Redis basic usage](https://stackexchange.github.io/StackExchange.Redis/Basics)

**Do**
1. `dotnet add package StackExchange.Redis`, then register the connection once:
   ```csharp
   builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
       ConnectionMultiplexer.Connect(builder.Configuration.GetConnectionString("Valkey")!));
   ```
2. Add a `LeaderboardService`:
   ```csharp
   public sealed class LeaderboardService(IConnectionMultiplexer redis)
   {
       private readonly IDatabase _db = redis.GetDatabase();
       private const string Key = "studyhub:leaderboard";

       public Task AddPointsAsync(string user, int points) => _db.SortedSetIncrementAsync(Key, user, points);

       public async Task<IEnumerable<object>> TopAsync(int n) =>
           (await _db.SortedSetRangeByRankWithScoresAsync(Key, 0, n - 1, Order.Descending))
               .Select((e, i) => new { rank = i + 1, user = e.Element.ToString(), points = e.Score });
   }
   ```
3. Add `POST /sessions` (body: user and minutes) that awards points, and `GET /leaderboard?top=10`.

**Done when:** posting study sessions changes the leaderboard order.

### Day 3: Streaks with expiry, and atomic operations

**Topic:** a streak is "studied on consecutive days". Valkey can do this with one key per day that expires automatically. Single commands are atomic, and `MULTI`/`EXEC` or a Lua script makes several commands atomic together.

**Learn (~15 min)**
- [Transactions](https://valkey.io/topics/transactions/) and [Scripting with Lua](https://valkey.io/topics/eval-intro/) (Valkey docs)

**Do:** when a session is posted, record the day and update the streak in one Lua script, so two requests at once can't double-count:
```csharp
const string script = """
    local today = KEYS[1]; local yesterday = KEYS[2]; local streak = KEYS[3]
    if redis.call('EXISTS', today) == 1 then return tonumber(redis.call('GET', streak) or '0') end
    redis.call('SET', today, 1, 'EX', 172800)
    if redis.call('EXISTS', yesterday) == 1 then return redis.call('INCR', streak) end
    redis.call('SET', streak, 1)
    return 1
    """;
var d = DateOnly.FromDateTime(DateTime.UtcNow);
var streak = (long)await _db.ScriptEvaluateAsync(script,
    [$"studyhub:studied:{user}:{d:yyyyMMdd}", $"studyhub:studied:{user}:{d.AddDays(-1):yyyyMMdd}", $"studyhub:streak:{user}"]);
```
Test it by posting two sessions at once (`curl ... & curl ...`) and checking the streak goes up by one.

**Done when:** the streak is correct, even with simultaneous requests.

### Day 4: Streams for study events

**Topic:** a stream is an append-only log. Producers add entries, and consumer groups read them, each entry handled once per group, with acknowledgements. It's a lightweight message queue.

**Learn (~20 min)**
- [Valkey streams](https://valkey.io/topics/streams-intro/)

**Do**
1. On each session, add an event: `await _db.StreamAddAsync("studyhub:events", [new("user", user), new("minutes", minutes), new("at", DateTime.UtcNow.ToString("O"))]);`
2. Create a second project, `StudyHub.Worker` (`dotnet new worker`), that reads with a consumer group and prints each event:
   ```csharp
   await db.StreamCreateConsumerGroupAsync("studyhub:events", "stats", StreamPosition.NewMessages, createStream: true)
       .ContinueWith(_ => { });   // ignore "group already exists"
   while (!stoppingToken.IsCancellationRequested)
   {
       var entries = await db.StreamReadGroupAsync("studyhub:events", "stats", "worker-1", ">", count: 10);
       foreach (var e in entries)
       {
           logger.LogInformation("Event {Id}: {User} studied {Minutes} min", e.Id, e["user"], e["minutes"]);
           await db.StreamAcknowledgeAsync("studyhub:events", "stats", e.Id);
       }
       if (entries.Length == 0) await Task.Delay(1000, stoppingToken);
   }
   ```
3. Add the worker to `compose.yaml`, post a few sessions, and watch the worker's logs. Check `XPENDING studyhub:events stats` in `valkey-cli`.

**Done when:** the worker processes every event once, and `XPENDING` shows nothing left after it acknowledges them.

### Day 5: Persistence, RDB and AOF

**Topic:** Valkey lives in memory, but it can save to disk. RDB takes snapshots now and then (fast restarts, may lose recent writes). AOF logs every write (safer, bigger files). Many setups use both.

**Learn (~20 min)**
- [Persistence](https://valkey.io/topics/persistence/) (Valkey docs)

**Do**
1. Check the current settings: `CONFIG GET save` and `CONFIG GET appendonly`.
2. Add data, run `docker compose kill valkey` (a crash, not a clean stop), start it, and check what survived.
3. Turn on AOF with `command: ["valkey-server", "--appendonly", "yes"]` in Compose, and repeat the crash test.
4. Look at the files: `docker compose exec valkey ls -la /data`.

**Done when:** you've seen data lost without AOF and kept with it, and you've decided what StudyHub needs: the leaderboard can be rebuilt, but streaks are harder to rebuild.

### Day 6: Mini project, the StudyHub stats service

**Do:** extend `StudyHub.Worker` so that, from the event stream, it keeps:
- total minutes per topic, in a hash `studyhub:minutes-by-topic`
- the number of distinct users each day, using a HyperLogLog (`PFADD studyhub:dau:<date> <user>` and `PFCOUNT`)

Add `GET /stats/topics` and `GET /stats/daily-users` to the API, reading those keys.

**Done when:** posting sessions updates both statistics, and you can explain why HyperLogLog uses only about 12 KB however many users there are.

### Day 7: Review and catch-up (light)

- Push the API and worker to `cloud-native-lab/week-11`.

---

## Week 12: MongoDB with C#

**By the end of the week:** StudyHub storing lessons and progress in MongoDB with the official C# driver, with CRUD, LINQ queries, and indexes you've proven with `explain`.

### Day 1: Documents and mongosh

**Topic:** MongoDB stores JSON-like documents (BSON) in collections. Documents in one collection can have different shapes, and a document can hold nested objects and arrays, so related data often lives together.

**Learn (~20 min)**
- [Introduction to MongoDB](https://www.mongodb.com/docs/manual/) (MongoDB docs)

**Do (`docker compose exec mongo mongosh studyhub`)**
```javascript
db.lessons.insertMany([
  { _id: 1, title: "Install WSL", topic: "linux", minutes: 60, tags: ["wsl", "ubuntu"] },
  { _id: 2, title: "Permissions", topic: "linux", minutes: 75, tags: ["chmod"] },
  { _id: 3, title: "Dockerfiles", topic: "docker", minutes: 70, tags: ["build"], links: [{ name: "docs", url: "https://docs.docker.com" }] }
])
db.lessons.find({ topic: "linux" })
db.lessons.find({ tags: "build" }, { title: 1, _id: 0 })
db.lessons.updateOne({ _id: 2 }, { $set: { minutes: 80 }, $push: { tags: "umask" } })
db.lessons.countDocuments({ minutes: { $gte: 70 } })
db.lessons.deleteOne({ _id: 3 })
```

**Done when:** you've inserted, queried, updated, and deleted documents, including a query on an array field.

### Day 2: The C# driver

**Learn (~20 min)**
- [MongoDB C# driver quick start](https://www.mongodb.com/docs/drivers/csharp/current/get-started/) (MongoDB docs)

**Do**
1. `dotnet add package MongoDB.Driver`
2. Map the lesson as a class, and register the client once:
   ```csharp
   public sealed class LessonDoc
   {
       [BsonId] public int Id { get; set; }
       public string Title { get; set; } = "";
       public string Topic { get; set; } = "";
       public int Minutes { get; set; }
       public List<string> Tags { get; set; } = [];
   }

   builder.Services.AddSingleton<IMongoClient>(_ => new MongoClient(builder.Configuration.GetConnectionString("Mongo")));
   builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoClient>().GetDatabase("studyhub").GetCollection<LessonDoc>("lessons"));
   ```
3. Write `MongoLessonRepository : ILessonRepository`, using `Find(l => l.Id == id).FirstOrDefaultAsync()`, and seed 50 lessons at startup if the collection is empty.
4. Swap it in place of `SlowLessonRepository`. Keep the HybridCache decorator from Week 10 in front of it.

**Done when:** StudyHub reads lessons from MongoDB, still through the cache.

### Day 3: CRUD and LINQ

**Learn (~15 min)**
- [LINQ](https://www.mongodb.com/docs/drivers/csharp/current/aggregation/linq/) (MongoDB C# driver docs)

**Do:** add endpoints and write each query two ways, with filters and with LINQ:
```csharp
// Filter builders
var filter = Builders<LessonDoc>.Filter.Eq(l => l.Topic, topic) & Builders<LessonDoc>.Filter.Gte(l => l.Minutes, 60);
var a = await lessons.Find(filter).SortBy(l => l.Minutes).Limit(10).ToListAsync();

// LINQ
var b = await lessons.AsQueryable().Where(l => l.Topic == topic && l.Minutes >= 60).OrderBy(l => l.Minutes).Take(10).ToListAsync();
```
Add `POST /lessons`, `PUT /lessons/{id}` (using `ReplaceOneAsync`), `PATCH /lessons/{id}/tags` (using `Builders<LessonDoc>.Update.AddToSet`), and `DELETE /lessons/{id}`. Each change must also call `RemoveByTagAsync` on HybridCache.

**Done when:** all endpoints work, and the cache never serves a deleted or outdated lesson.

### Day 4: Indexes and explain

**Topic:** without an index, MongoDB scans every document (`COLLSCAN`). With one, it uses `IXSCAN` and reads only what matches. Compound index order matters: equality first, then sort, then range.

**Learn (~20 min)**
- [Indexes](https://www.mongodb.com/docs/manual/indexes/) (MongoDB docs)

**Do**
1. In mongosh, insert 100,000 progress documents with a loop: `for (let i = 0; i < 100000; i++) db.progress.insertOne({ user: "u" + (i % 500), lessonId: i % 50, minutes: i % 90, at: new Date(Date.now() - i * 60000) })`.
2. Run `db.progress.find({ user: "u42" }).sort({ at: -1 }).explain("executionStats")`, and note `totalDocsExamined`.
3. Create an index with `db.progress.createIndex({ user: 1, at: -1 })`, and run the same explain again.
4. Create the same index from C# at startup with `CreateOneAsync(new CreateIndexModel<ProgressDoc>(Builders<ProgressDoc>.IndexKeys.Ascending(p => p.User).Descending(p => p.At)))`.

**Done when:** documents examined drops from 100,000 to roughly the number of results, and the winning plan shows `IXSCAN`.

### Day 5: User progress in MongoDB

**Do:** add a `progress` collection and endpoints:
- `POST /progress` saves `{ user, lessonId, minutes, at }`
- `GET /users/{user}/progress?limit=20` returns that user's latest entries (using your Day 4 index)
- `GET /users/{user}/summary` returns lessons done and total minutes, using `CountDocumentsAsync` and a simple sum

Make `POST /sessions` (from Week 11) write to MongoDB as well as updating the Valkey leaderboard.

**Done when:** progress is stored in MongoDB, and the leaderboard still updates in Valkey.

### Day 6: Mini project, a seeded demo

**Do:** add `StudyHub.Seed`, a console app that creates 50 lessons, 500 users, and 200,000 progress entries with the `InsertManyAsync` bulk API, in batches of 5,000. Time it, then time `GET /users/u42/summary` before and after adding the indexes it needs.

**Done when:** you have a realistic data set, and every API query uses an index (check each with `explain`).

### Day 7: Review and catch-up (light)

- Push to `cloud-native-lab/week-12`.

---

## Week 13: MongoDB modeling, aggregation, and replica sets

**By the end of the week:** well-reasoned document models, aggregation pipelines for StudyHub's reports, a three-node replica set, transactions, change streams, and TTL indexes.

### Day 1: Embed or reference?

**Topic:** in MongoDB you design for how data is read. Embed data that's always read together and bounded in size. Reference data that's shared, large, or grows without limit.

**Learn (~25 min)**
- [Data modeling](https://www.mongodb.com/docs/manual/data-modeling/) (MongoDB docs)

**Do:** decide and write down the model for each, with a reason:
- a lesson's links (few, always shown with the lesson)
- a user's progress entries (thousands, growing)
- a lesson's comments (could be many)
- a user's profile and settings

**Done when:** you've written a decision and reason for each, including the 16 MB document limit where it matters.

### Day 2: The aggregation pipeline

**Learn (~20 min)**
- [Aggregation pipeline](https://www.mongodb.com/docs/manual/core/aggregation-pipeline/) (MongoDB docs)

**Do:** in mongosh, then in C#, write a report of total minutes per topic in the last 7 days:
```javascript
db.progress.aggregate([
  { $match: { at: { $gte: new Date(Date.now() - 7 * 864e5) } } },
  { $lookup: { from: "lessons", localField: "lessonId", foreignField: "_id", as: "lesson" } },
  { $unwind: "$lesson" },
  { $group: { _id: "$lesson.topic", minutes: { $sum: "$minutes" }, users: { $addToSet: "$user" } } },
  { $project: { topic: "$_id", minutes: 1, users: { $size: "$users" }, _id: 0 } },
  { $sort: { minutes: -1 } }
])
```
In C#, use `lessons.Aggregate().Match(...).Lookup(...)` or pass the stages as `BsonDocument`s, and expose it as `GET /reports/topics`.

**Done when:** the endpoint returns minutes and distinct users per topic, and its result is cached in HybridCache for one minute.

### Day 3: A replica set, and why it matters

**Topic:** a replica set is three or more MongoDB servers holding the same data. One is primary, and if it fails, another takes over in seconds. Transactions and change streams need a replica set.

**Learn (~20 min)**
- [Replication](https://www.mongodb.com/docs/manual/replication/) (MongoDB docs)

**Do:** create `compose.replica.yaml` with three nodes:
```yaml
services:
  mongo1: { image: mongo:8, command: ["--replSet", "rs0", "--bind_ip_all"], ports: ["27017:27017"] }
  mongo2: { image: mongo:8, command: ["--replSet", "rs0", "--bind_ip_all"] }
  mongo3: { image: mongo:8, command: ["--replSet", "rs0", "--bind_ip_all"] }
```
```bash
docker compose -f compose.replica.yaml up -d
docker compose -f compose.replica.yaml exec mongo1 mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"mongo1"},{_id:1,host:"mongo2"},{_id:2,host:"mongo3"}]})'
docker compose -f compose.replica.yaml exec mongo1 mongosh --eval 'rs.status().members.map(m => m.name + " " + m.stateStr)'
docker compose -f compose.replica.yaml stop mongo1     # watch another node become PRIMARY
```
Point StudyHub at `mongodb://mongo1,mongo2,mongo3/?replicaSet=rs0`, running in the same Compose network, and check it keeps working while you stop the primary.

**Done when:** StudyHub survives the primary going down.

### Day 4: Transactions and write concerns

**Learn (~20 min)**
- [Transactions](https://www.mongodb.com/docs/manual/core/transactions/) and [Write concern](https://www.mongodb.com/docs/manual/reference/write-concern/) (MongoDB docs)

**Do:** saving a session now updates two collections: insert into `progress`, and increment counters in a `user_stats` document. Do both in a transaction:
```csharp
using var session = await client.StartSessionAsync();
await session.WithTransactionAsync(async (s, ct) =>
{
    await progress.InsertOneAsync(s, entry, cancellationToken: ct);
    await stats.UpdateOneAsync(s, x => x.User == entry.User,
        Builders<UserStats>.Update.Inc(x => x.Minutes, entry.Minutes).Inc(x => x.Sessions, 1),
        new UpdateOptions { IsUpsert = true }, ct);
    return true;
});
```
Then throw an exception between the two writes, and check that neither was saved.

**Done when:** a failure in the middle leaves no half-saved data.

### Day 5: Change streams and TTL indexes

**Topic:** change streams let your app react to inserts and updates as they happen. TTL indexes delete documents automatically after a time.

**Learn (~15 min)**
- [Change streams](https://www.mongodb.com/docs/manual/changestreams/) and [TTL indexes](https://www.mongodb.com/docs/manual/core/index-ttl/) (MongoDB docs)

**Do**
1. In `StudyHub.Worker`, watch the `lessons` collection with `await lessons.WatchAsync()`, and on each change call `RemoveByTagAsync` on HybridCache. Now even edits made directly in mongosh clear the cache.
2. Add a `sessions_log` collection for raw request logs, with a TTL index that deletes entries after 1 day: `createIndex({ at: 1 }, { expireAfterSeconds: 86400 })`. Insert a document with an old date, and wait about a minute for it to disappear (the TTL monitor runs every 60 seconds).

**Done when:** an edit in mongosh clears StudyHub's cache within a second, and old log documents delete themselves.

### Day 6: Mini project, schema validation and a data guide

**Do**
1. Add a `$jsonSchema` validator to `lessons` that requires `title` (a string of 3–120 characters), `topic` (one of your topics), and `minutes` (an integer between 5 and 180). Check that a bad insert is rejected.
2. Write `nosql/MONGODB.md`: your collections, their shapes, their indexes and the query each one serves, the transaction you use, the change stream, and the TTL index.

**Done when:** invalid lessons are rejected, and the guide matches the code.

### Day 7: Review and catch-up (light)

- Push to `cloud-native-lab/week-13`. Go back to the single MongoDB node in your main `compose.yaml` to save memory, but keep the replica set file.

---

## Week 14: DynamoDB from .NET, and choosing a NoSQL database

**By the end of the week:** StudyHub's session events in DynamoDB (locally), designed around access patterns, plus a written guide to choosing between SQL, Valkey, MongoDB, and DynamoDB.

### Day 1: How DynamoDB thinks

**Topic:** in DynamoDB you list your queries first, then design keys to answer each one with a single `Query`. There are no joins, and `Scan` reads the whole table, so it's avoided.

**Learn (~25 min)**
- [Core components of DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.CoreComponents.html) and [Best practices for designing partition keys](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html)

**Do:** list StudyHub's event queries, and design keys:

| Access pattern | Key condition |
|---|---|
| A user's sessions, newest first | `PK = USER#<id>`, `SK` begins with `SESSION#`, descending |
| A user's sessions in a date range | `SK BETWEEN SESSION#<from> AND SESSION#<to>` |
| All sessions for a lesson on a day | a GSI with `GSI1PK = LESSON#<id>#<date>` |

**Done when:** every access pattern is answered by one `Query`.

### Day 2: DynamoDB Local and the AWS CLI

**Learn (~10 min)**
- [Deploying DynamoDB locally](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html)

**Do**
1. Add DynamoDB Local to Compose: `dynamodb: { image: amazon/dynamodb-local, ports: ["8000:8000"] }`.
2. Install the AWS CLI in Ubuntu (see the [install guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)), and create the table locally. Any fake credentials work with DynamoDB Local:
   ```bash
   export AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_REGION=us-east-1
   aws dynamodb create-table --endpoint-url http://localhost:8000 --table-name studyhub-events \
     --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
                             AttributeName=GSI1PK,AttributeType=S AttributeName=GSI1SK,AttributeType=S \
     --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
     --global-secondary-indexes 'IndexName=GSI1,KeySchema=[{AttributeName=GSI1PK,KeyType=HASH},{AttributeName=GSI1SK,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
     --billing-mode PAY_PER_REQUEST
   aws dynamodb list-tables --endpoint-url http://localhost:8000
   ```

**Done when:** the table and its index exist in DynamoDB Local.

### Day 3: Writing and querying from C#

**Learn (~15 min)**
- [Working with items using the .NET SDK](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DotNetSDKMidLevel.html)

**Do**
1. `dotnet add package AWSSDK.DynamoDBv2`, and point the client at DynamoDB Local in development:
   ```csharp
   builder.Services.AddSingleton<IAmazonDynamoDB>(_ => new AmazonDynamoDBClient(
       new AmazonDynamoDBConfig { ServiceURL = builder.Configuration["DynamoDb:ServiceUrl"] ?? "http://dynamodb:8000" }));
   ```
2. In `POST /sessions`, also write an event item:
   ```csharp
   await ddb.PutItemAsync(new PutItemRequest
   {
       TableName = "studyhub-events",
       Item = new()
       {
           ["PK"] = new($"USER#{user}"), ["SK"] = new($"SESSION#{at:O}"),
           ["GSI1PK"] = new($"LESSON#{lessonId}#{at:yyyy-MM-dd}"), ["GSI1SK"] = new($"{at:O}"),
           ["minutes"] = new() { N = minutes.ToString() },
           ["expiresAt"] = new() { N = at.AddDays(90).ToUnixTimeSeconds().ToString() }
       }
   });
   ```
3. Add `GET /users/{user}/events?from=&to=` using a `QueryRequest` with `KeyConditionExpression = "PK = :pk AND SK BETWEEN :from AND :to"` and `ScanIndexForward = false`.

**Done when:** events are written and read back with a `Query`, newest first.

### Day 4: Conditional writes, GSIs, and TTL

**Do**
1. Stop duplicate events: add `ConditionExpression = "attribute_not_exists(PK)"` to the put, and handle `ConditionalCheckFailedException` by returning `409`.
2. Query the GSI: `IndexName = "GSI1"`, for "all sessions for lesson 3 today".
3. Turn on TTL for `expiresAt` with `aws dynamodb update-time-to-live --endpoint-url http://localhost:8000 --table-name studyhub-events --time-to-live-specification Enabled=true,AttributeName=expiresAt`. DynamoDB Local accepts the setting, but deleting expired items only happens on the real service.

**Done when:** duplicates return `409`, and the GSI query works.

### Day 5: Choosing the right database

**Learn (~20 min)**
- [roadmap.sh Backend](https://roadmap.sh/backend): the "More about databases" and NoSQL topics

**Do:** write `nosql/CHOOSING.md` with a comparison you'd use at work:

| | PostgreSQL / SQL Server | Valkey | MongoDB | DynamoDB |
|---|---|---|---|---|
| Data shape | | | | |
| Query flexibility | | | | |
| Scaling model | | | | |
| Consistency | | | | |
| Where StudyHub uses it | (not used) | cache, leaderboard, streaks, stream | lessons, progress, reports | session events |
| When you'd pick it | | | | |

**Done when:** every cell is filled in, and you can defend each StudyHub choice.

### Day 6: Mini project, the whole data layer in Compose

**Do:** run StudyHub, the worker, Valkey, MongoDB, and DynamoDB Local with `docker compose up -d`. Write a script, `smoke-test.sh`, that posts five sessions and checks:
- the leaderboard changed (Valkey)
- the progress summary changed (MongoDB)
- the events query returns five items (DynamoDB)
- the worker logged five events (the stream)

**Done when:** `./smoke-test.sh` passes on a fresh `docker compose down -v && docker compose up -d`.

### Day 7: Review and catch-up (light)

- Push to `cloud-native-lab/week-14`. Section D is complete. Mark the topics on [roadmap.sh/mongodb](https://roadmap.sh/mongodb), [roadmap.sh/redis](https://roadmap.sh/redis), and [roadmap.sh/backend](https://roadmap.sh/backend).
