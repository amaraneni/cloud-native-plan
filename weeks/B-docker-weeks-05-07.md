# Section B: Docker in depth (Weeks 5–7)

You'll go past "it runs in a container" to understanding what a container is on Linux, building small and secure .NET images, and running StudyHub with its databases in Docker Compose. Everything here is used again in Kubernetes and EKS.

**Setup:** Docker Desktop with the WSL 2 backend. In Docker Desktop, open **Settings → Resources → WSL integration** and turn it on for Ubuntu. Then **(Ubuntu)** run `docker version`, and check that both Client and Server appear.

**Courses for this section (optional, see [resources.md](../resources.md)):** Udemy's [Docker and Kubernetes: The Complete Guide](https://www.udemy.com/course/docker-and-kubernetes-the-complete-guide/) (Docker sections), and the free [Docker: Get started](https://docs.docker.com/get-started/).
**roadmap.sh:** [Docker](https://roadmap.sh/docker).

---

## Week 5: Images and containers, and how they really work

**By the end of the week:** you can explain a container as a Linux process with namespaces and cgroups, read image layers, and manage the full container lifecycle.

### Day 1: Containers are Linux processes

**Topic:** a container is an ordinary process that the kernel isolates with **namespaces** (what it can see) and limits with **cgroups** (what it can use). Docker packages that up with an image.

**Learn (~20 min)**
- [What is a container?](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/) (Docker docs)

**Do (Ubuntu)**
1. Isolate a shell yourself, without Docker:
   ```bash
   sudo unshare --pid --fork --mount-proc --uts bash
   hostname isolated-box; hostname   # changes only inside
   ps -ef                            # you are PID 1 and see almost nothing
   exit
   ```
2. Now run a container and find it from the outside:
   ```bash
   docker run -d --name sleeper alpine sleep 600
   docker top sleeper                 # the process, seen from the host
   docker inspect -f '{{.State.Pid}}' sleeper
   docker stats --no-stream sleeper   # cgroup limits and usage
   docker rm -f sleeper
   ```

**Done when:** you can explain namespaces and cgroups in two sentences, with today's commands as the evidence.

### Day 2: Images and layers

**Topic:** an image is a stack of read-only layers plus settings. Containers add one writable layer on top. Layers are shared between images, which saves space and download time.

**Learn (~15 min)**
- [Understanding the image layers](https://docs.docker.com/get-started/docker-concepts/building-images/understanding-image-layers/) (Docker docs)

**Do**
```bash
docker pull mcr.microsoft.com/dotnet/aspnet:10.0
docker pull mcr.microsoft.com/dotnet/aspnet:10.0-alpine
docker images | grep dotnet                  # compare sizes
docker history mcr.microsoft.com/dotnet/aspnet:10.0
docker image inspect mcr.microsoft.com/dotnet/aspnet:10.0 --format '{{json .Config}}' | jq
docker system df                             # space used by images, containers, and volumes
```

**Done when:** you can say which layers make up the aspnet image, and why the Alpine one is smaller.

### Day 3: The container lifecycle

**Do:** practice each state and command:
```bash
docker run -d --name web -p 8080:80 nginx
docker ps; docker logs -f web          # open http://localhost:8080, then Ctrl+C
docker exec -it web sh                 # look around inside, then exit
docker stop web; docker ps -a          # stopped, but still there
docker start web; docker restart web
docker cp web:/etc/nginx/nginx.conf .  # copy a file out
docker rm -f web
docker run --rm -it ubuntu:24.04 bash  # a throwaway container, removed on exit
```
Then run a container with limits, and watch them apply:
```bash
docker run --rm -m 64m --cpus 0.5 alpine sh -c "cat /sys/fs/cgroup/memory.max; cat /sys/fs/cgroup/cpu.max"
```

**Done when:** you can move a container through created, running, stopped, and removed, and you've set memory and CPU limits.

### Day 4: Writing a Dockerfile

**Topic:** a Dockerfile is the recipe for an image. Each instruction creates a layer, so order matters for caching.

**Learn (~20 min)**
- [Writing a Dockerfile](https://docs.docker.com/get-started/docker-concepts/building-images/writing-a-dockerfile/) and [Using the build cache](https://docs.docker.com/get-started/docker-concepts/building-images/using-the-build-cache/) (Docker docs)

**Do:** containerize your Week 1 `sysinfo.sh`:
```dockerfile
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends procps && rm -rf /var/lib/apt/lists/*
COPY sysinfo.sh /usr/local/bin/sysinfo
RUN chmod +x /usr/local/bin/sysinfo
ENTRYPOINT ["sysinfo"]
```
```bash
docker build -t sysinfo:1 .
docker run --rm sysinfo:1
```
Edit `sysinfo.sh`, rebuild, and watch which steps say `CACHED`.

**Done when:** your script runs in a container, and you can explain why `COPY` comes after `apt-get`.

### Day 5: Environment, ports, and restart policies

**Do**
```bash
docker run -d --name h1 --restart unless-stopped -p 8081:80 -e NGINX_HOST=lab nginx
docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' h1
docker exec h1 env | grep NGINX
docker kill h1; sleep 2; docker ps -a --filter name=h1   # killed containers aren't restarted
docker exec h1 nginx -s stop 2>/dev/null; sleep 3; docker ps --filter name=h1  # a crash is restarted
docker rm -f h1
```
Then use an env file: create `app.env` with two `KEY=value` lines, and run `docker run --rm --env-file app.env alpine env`.

**Done when:** you know the difference between `no`, `on-failure`, `always`, and `unless-stopped`.

### Day 6: Mini project, debug a broken container

**Do:** build this deliberately broken image and fix it using only `docker logs`, `docker inspect`, and `docker exec`:
```dockerfile
FROM python:3.13-slim
WORKDIR /app
RUN echo 'import os, http.server; http.server.test(port=int(os.environ["PORT"]))' > app.py
EXPOSE 9000
CMD ["python", "app.py"]
```
Run it with `docker run -d -p 9000:9000 --name broken broken:1`. There are two problems: a missing environment variable, and a port mismatch. Write down how you found each one.

**Done when:** `curl localhost:9000` works, and you've written down the steps you took to find both bugs.

### Day 7: Review and catch-up (light)

- Push your Dockerfiles and notes to `cloud-native-lab/week-05`.
- Clean up with `docker system prune` (it removes stopped containers and unused images; read the prompt first).

---

## Week 6: Building small, secure .NET images

**By the end of the week:** StudyHub in a multi-stage, non-root, chiseled image under 120 MB, built with cache mounts, scanned for vulnerabilities, and also built with the .NET SDK's container publishing.

### Day 1: A multi-stage Dockerfile for StudyHub

**Topic:** the SDK image is large and full of build tools. A multi-stage build compiles in the SDK image, then copies only the output into a small runtime image.

**Learn (~20 min)**
- [Containerize a .NET app](https://learn.microsoft.com/en-us/dotnet/core/docker/build-container) (Microsoft Learn)

**Do:** in `~/code/studyhub/StudyHub.Api`, create `Dockerfile` and `.dockerignore`:
```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY StudyHub.Api.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
EXPOSE 8080
ENTRYPOINT ["dotnet", "StudyHub.Api.dll"]
```
```text
bin/
obj/
publish/
```
Build it with `docker build -t studyhub:1 .` and run it with `docker run --rm -p 5080:8080 studyhub:1`. The .NET 8+ images listen on port 8080 by default.

**Done when:** `curl localhost:5080/lessons` works from the container, and you've noted the image size with `docker images studyhub`.

### Day 2: Non-root and chiseled images

**Topic:** containers shouldn't run as root. Microsoft's **chiseled** Ubuntu images contain only what .NET needs: no shell, no package manager, and a non-root user. They're smaller and have far fewer vulnerabilities.

**Learn (~15 min)**
- [Container images for .NET](https://learn.microsoft.com/en-us/dotnet/core/docker/container-images) (Microsoft Learn), the chiseled images section

**Do**
1. Check who your current image runs as: `docker run --rm --entrypoint whoami studyhub:1`. The .NET images define an `app` user, but don't switch to it automatically in every image.
2. Change the final stage to the chiseled image and the non-root user:
   ```dockerfile
   FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled
   WORKDIR /app
   COPY --from=build /app .
   USER $APP_UID
   EXPOSE 8080
   ENTRYPOINT ["dotnet", "StudyHub.Api.dll"]
   ```
3. Build `studyhub:2`, and compare sizes. Try `docker exec -it <id> sh`. It fails, because there's no shell, which is the point.

**Done when:** `studyhub:2` runs, is clearly smaller than `studyhub:1`, and has no shell.

### Day 3: Faster builds with BuildKit cache mounts

**Topic:** every `dotnet restore` downloads NuGet packages again. A BuildKit cache mount keeps the package folder between builds, without putting it in the image.

**Learn (~15 min)**
- [Optimize cache usage in builds](https://docs.docker.com/build/cache/optimize/) (Docker docs)

**Do:** change the restore and publish lines to use a cache mount:
```dockerfile
RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages dotnet restore
COPY . .
RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages dotnet publish -c Release -o /app --no-restore
```
Add a NuGet package (`dotnet add package Humanizer`), then time a rebuild with `time docker build -t studyhub:3 .` before and after the change.

**Done when:** a rebuild after adding a package is noticeably faster with the cache mount.

### Day 4: Building with the .NET SDK, no Dockerfile

**Topic:** `dotnet publish` can build a container image directly. It picks a matching base image, runs as non-root by default, and is easy to use in CI.

**Learn (~15 min)**
- [Containerize a .NET app with dotnet publish](https://learn.microsoft.com/en-us/dotnet/core/containers/sdk-publish) (Microsoft Learn)

**Do**
1. Add these properties to `StudyHub.Api.csproj`:
   ```xml
   <PropertyGroup>
     <ContainerRepository>studyhub</ContainerRepository>
     <ContainerImageTags>sdk-4</ContainerImageTags>
     <ContainerFamily>noble-chiseled</ContainerFamily>
   </PropertyGroup>
   ```
2. Build it: `dotnet publish -c Release --os linux --arch x64 /t:PublishContainer`.
3. Run `docker images studyhub`, and compare the `sdk-4` image with your Dockerfile build.

**Done when:** you've built the same app both ways, and can say when you'd pick each one.

### Day 5: Scanning images for vulnerabilities

**Topic:** images include OS packages with known security bugs (CVEs). Scanners compare them with vulnerability databases. Scan before you push, and rebuild regularly to pick up patches.

**Learn (~15 min)**
- [Trivy: scanning container images](https://trivy.dev/docs/latest/target/container_image/)

**Do**
```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image --severity HIGH,CRITICAL studyhub:1
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image --severity HIGH,CRITICAL studyhub:2
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image --severity HIGH,CRITICAL python:3.13
```
If you're signed in to Docker Desktop, also try `docker scout quickview studyhub:2`.

**Done when:** you have a table of HIGH and CRITICAL counts for the three images, and the chiseled image has the fewest.

### Day 6: Mini project, an image checklist

**Do:** write `docker/IMAGE-CHECKLIST.md` for StudyHub, and make the image pass every item:
- multi-stage build, chiseled runtime image
- runs as a non-root user
- `.dockerignore` keeps `bin`, `obj`, and secrets out
- image size under 120 MB
- no HIGH or CRITICAL findings in Trivy (or each one is explained)
- a `HEALTHCHECK` isn't possible without a shell or curl, so the plan is to use Kubernetes probes in Week 18; note that down
- labels for source and version: `LABEL org.opencontainers.image.source="https://github.com/<you>/cloud-native-lab"`

**Done when:** the checklist is ticked, and `studyhub:5` meets every item.

### Day 7: Review and catch-up (light)

- Push the Dockerfile, csproj changes, and checklist to `cloud-native-lab/week-06`.

---

## Week 7: Networks, volumes, Docker Compose, and registries

**By the end of the week:** StudyHub, MongoDB, and Valkey running together in Docker Compose with health checks and persistent data, and the StudyHub image pushed to GitHub's registry for two CPU types.

### Day 1: Container networks

**Topic:** on a user-defined network, containers find each other by name through Docker's built-in DNS. The default `bridge` network doesn't give you names.

**Learn (~15 min)**
- [Networking overview](https://docs.docker.com/engine/network/) (Docker docs)

**Do**
```bash
docker network create labnet
docker run -d --name api --network labnet studyhub:5
docker run --rm --network labnet curlimages/curl -s http://api:8080/health
docker run --rm curlimages/curl -s --max-time 3 http://api:8080/health   # fails: different network
docker network inspect labnet | jq '.[0].Containers'
docker rm -f api; docker network rm labnet
```

**Done when:** you've reached a container by name, and seen it fail from another network.

### Day 2: Volumes and bind mounts

**Topic:** a container's writable layer disappears when it's removed. **Volumes** (managed by Docker) keep data. **Bind mounts** map a host folder, which suits config and source code.

**Learn (~15 min)**
- [Persisting container data](https://docs.docker.com/get-started/docker-concepts/running-containers/persisting-container-data/) (Docker docs)

**Do**
```bash
docker volume create mongo-data
docker run -d --name mongo -v mongo-data:/data/db mongo:8
docker exec mongo mongosh --quiet --eval 'db.test.insertOne({hello: "volume"})'
docker rm -f mongo
docker run -d --name mongo -v mongo-data:/data/db mongo:8
docker exec mongo mongosh --quiet --eval 'db.test.find().toArray()'   # the data survived
docker rm -f mongo
docker run --rm -v "$PWD":/work -w /work alpine ls                     # a bind mount
```

**Done when:** data survives removing and recreating the container.

### Day 3: Docker Compose for StudyHub

**Learn (~15 min)**
- [Docker Compose quickstart](https://docs.docker.com/compose/gettingstarted/) (Docker docs)

**Do:** create `~/code/studyhub/compose.yaml`:
```yaml
services:
  api:
    build: ./StudyHub.Api
    ports: ["5080:8080"]
    environment:
      ConnectionStrings__Mongo: mongodb://mongo:27017
      ConnectionStrings__Valkey: valkey:6379
    depends_on:
      mongo: { condition: service_healthy }
      valkey: { condition: service_healthy }
  mongo:
    image: mongo:8
    volumes: [mongo-data:/data/db]
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      retries: 10
  valkey:
    image: valkey/valkey:8
    volumes: [valkey-data:/data]
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 5s
      retries: 10
volumes:
  mongo-data:
  valkey-data:
```
StudyHub doesn't use MongoDB or Valkey yet. That starts in Weeks 9 and 12.

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

**Done when:** all three services are healthy, and the API answers on port 5080.

### Day 4: Compose for daily work

**Learn (~15 min)**
- [Compose file reference](https://docs.docker.com/reference/compose-file/services/): `profiles`, `env_file`, and `deploy.resources`

**Do**
1. Move settings into a `.env` file, and reference them as `${VALKEY_IMAGE:-valkey/valkey:8}`.
2. Add a `tools` profile with Mongo Express or another admin UI that only starts with `docker compose --profile tools up -d`.
3. Add memory limits to each service under `deploy.resources.limits`.
4. Scale the API to two copies: `docker compose up -d --scale api=2`. It fails because of the fixed host port. Remove the `ports` line, add an `nginx` service in front, and note the problem for Week 9 (two copies need a shared cache).

**Done when:** you can start, scale, and profile your stack, and you understand why two copies can't share a fixed port.

### Day 5: Pushing to a registry

**Topic:** a registry stores images so other machines can pull them. You'll use GitHub Container Registry (ghcr.io) now, and Amazon ECR in Week 21.

**Learn (~15 min)**
- [Working with the Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) (GitHub Docs)

**Do**
1. Create a GitHub personal access token (classic) with `write:packages` scope, then log in: `echo "<token>" | docker login ghcr.io -u <your-github-user> --password-stdin`.
2. Tag and push: `docker tag studyhub:5 ghcr.io/<you>/studyhub:0.1.0 && docker push ghcr.io/<you>/studyhub:0.1.0`.
3. Remove the local copy and pull it back: `docker rmi ghcr.io/<you>/studyhub:0.1.0 && docker pull ghcr.io/<you>/studyhub:0.1.0`.

**Done when:** the image appears under Packages on your GitHub profile, and you can pull it.

**Keep the token secret.** Don't put it in a file in your repository.

### Day 6: Multi-architecture images with buildx

**Topic:** many cloud servers (AWS Graviton, for example) use ARM64 CPUs. `docker buildx` builds one image tag that works on both x64 and ARM64.

**Learn (~15 min)**
- [Multi-platform builds](https://docs.docker.com/build/building/multi-platform/) (Docker docs)

**Do**
```bash
docker buildx create --name multi --use
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/<you>/studyhub:0.1.1 --push ./StudyHub.Api
docker buildx imagetools inspect ghcr.io/<you>/studyhub:0.1.1
```

**Done when:** `imagetools inspect` lists both `linux/amd64` and `linux/arm64`.

### Day 7: Review and catch-up (light)

- Push `compose.yaml` (not `.env` if it has secrets) to `cloud-native-lab/week-07`.
- Section B is complete. Mark the topics on [roadmap.sh/docker](https://roadmap.sh/docker).
