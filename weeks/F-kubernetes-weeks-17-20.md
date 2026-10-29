# Section F: Kubernetes (Weeks 17–20)

Kubernetes runs containers across many machines: it schedules them, restarts them, scales them, and routes traffic to them. You'll learn it on **kind** (Kubernetes in Docker), a free local cluster that behaves like a real one. Everything you write here is reused unchanged on EKS in Section G.

**Setup:** install [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/), [kind](https://kind.sigs.k8s.io/docs/user/quick-start/), and [Helm](https://helm.sh/docs/intro/install/) in Ubuntu. Give Docker Desktop at least 8 GB of memory (**Settings → Resources**).

**Courses for this section (optional, see [resources.md](../resources.md)):** Udemy's [Kubernetes for the Absolute Beginners](https://www.udemy.com/course/learn-kubernetes/) and [Certified Kubernetes Application Developer (CKAD)](https://www.udemy.com/course/certified-kubernetes-application-developer/) by Mumshad Mannambeth, and the free [Kubernetes tutorials](https://kubernetes.io/docs/tutorials/).
**roadmap.sh:** [Kubernetes](https://roadmap.sh/kubernetes).

---

## Week 17: Kubernetes basics with kind

**By the end of the week:** a three-node kind cluster running StudyHub as a Deployment with a Service, and the kubectl skills to inspect, update, and roll back anything.

### Day 1: How Kubernetes works

**Topic:** you describe the state you want in YAML (for example "3 copies of StudyHub"), and controllers keep making the cluster match it. The control plane makes decisions, and the worker nodes run your containers.

**Learn (~25 min)**
- [Kubernetes components](https://kubernetes.io/docs/concepts/overview/components/) and [Objects in Kubernetes](https://kubernetes.io/docs/concepts/overview/working-with-objects/)

**Do:** draw the components: the API server, etcd, the scheduler, and controller manager on the control plane, and the kubelet, kube-proxy, and container runtime on each node. Mark which ones you'd see failing if a node lost power.

**Done when:** you can explain "desired state" and "reconciliation" in two sentences.

### Day 2: A multi-node cluster with kind

**Learn (~10 min)**
- [kind quick start](https://kind.sigs.k8s.io/docs/user/quick-start/)

**Do**
1. Create `kind-config.yaml`:
   ```yaml
   kind: Cluster
   apiVersion: kind.x-k8s.io/v1alpha4
   name: lab
   nodes:
     - role: control-plane
       extraPortMappings:
         - { containerPort: 30080, hostPort: 30080 }
     - role: worker
     - role: worker
   ```
2. Create the cluster and look around:
   ```bash
   kind create cluster --config kind-config.yaml
   kubectl cluster-info
   kubectl get nodes -o wide
   kubectl get pods -A           # the system pods
   docker ps                     # each node is a container
   ```

**Done when:** three nodes show `Ready`, and you can explain why each one is a Docker container.

### Day 3: Pods and kubectl

**Learn (~15 min)**
- [Pods](https://kubernetes.io/docs/concepts/workloads/pods/) and the [kubectl quick reference](https://kubernetes.io/docs/reference/kubectl/quick-reference/)

**Do**
```bash
kubectl run web --image=nginx --port=80
kubectl get pods -o wide              # which node it landed on
kubectl describe pod web              # events: scheduled, pulled, started
kubectl logs web
kubectl exec -it web -- sh
kubectl port-forward pod/web 8080:80  # open http://localhost:8080, then Ctrl+C
kubectl get pod web -o yaml | less    # the full object, as the API server stores it
kubectl explain pod.spec.containers   # built-in docs for any field
kubectl delete pod web                # nothing brings it back: a bare pod isn't managed
```

**Done when:** you've created, inspected, entered, and deleted a pod, and seen that a bare pod isn't recreated.

### Day 4: Deployments and Services for StudyHub

**Learn (~20 min)**
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) and [Services](https://kubernetes.io/docs/concepts/services-networking/service/)

**Do**
1. Load your image into the cluster (kind can't see your local Docker images otherwise): `kind load docker-image studyhub:5 --name lab`.
2. Create `k8s/studyhub.yaml`:
   ```yaml
   apiVersion: apps/v1
   kind: Deployment
   metadata: { name: studyhub, labels: { app: studyhub } }
   spec:
     replicas: 3
     selector: { matchLabels: { app: studyhub } }
     template:
       metadata: { labels: { app: studyhub } }
       spec:
         containers:
           - name: api
             image: studyhub:5
             imagePullPolicy: IfNotPresent
             ports: [{ containerPort: 8080 }]
   ---
   apiVersion: v1
   kind: Service
   metadata: { name: studyhub }
   spec:
     type: NodePort
     selector: { app: studyhub }
     ports: [{ port: 80, targetPort: 8080, nodePort: 30080 }]
   ```
3. Apply it and test:
   ```bash
   kubectl apply -f k8s/studyhub.yaml
   kubectl get deploy,rs,pods,svc -o wide
   for i in $(seq 1 6); do curl -s localhost:30080/whoami; echo; done   # different pods answer
   kubectl delete pod -l app=studyhub --wait=false; kubectl get pods -w  # replaced at once
   ```
   Your app still expects MongoDB and Valkey. Endpoints that need them fail until Week 18, but `/health` and `/whoami` work.

**Done when:** three pods spread across the workers answer on port 30080, and deleted pods come back.

### Day 5: Rolling updates and rollbacks

**Learn (~15 min)**
- [Performing a rolling update](https://kubernetes.io/docs/tutorials/kubernetes-basics/update/update-intro/)

**Do**
```bash
docker build -t studyhub:6 ./StudyHub.Api && kind load docker-image studyhub:6 --name lab
kubectl set image deployment/studyhub api=studyhub:6
kubectl rollout status deployment/studyhub
kubectl rollout history deployment/studyhub
kubectl set image deployment/studyhub api=studyhub:does-not-exist   # a bad release
kubectl get pods                                                    # ErrImageNeverPull or ImagePullBackOff
kubectl rollout undo deployment/studyhub
kubectl rollout status deployment/studyhub
```
While the update runs, keep `while true; do curl -s -o /dev/null -w "%{http_code} " localhost:30080/health; sleep 0.2; done` going in another terminal.

**Done when:** a good release rolls out with no failed requests, and a bad one is rolled back with one command.

### Day 6: Mini project, namespaces and labels

**Do**
1. Create `dev` and `test` namespaces, and deploy StudyHub to both: `kubectl apply -f k8s/studyhub.yaml -n dev`. Change the NodePort in the `test` copy to avoid a clash, or switch its Service to `ClusterIP`.
2. Add labels `tier: api` and `team: you`, and practice selecting: `kubectl get pods -A -l tier=api`.
3. Set a default namespace for your shell: `kubectl config set-context --current --namespace=dev`.
4. Write `k8s/CHEATSHEET.md` with the 20 kubectl commands you used most.

**Done when:** the same app runs in two namespaces, and you can switch between them easily.

### Day 7: Review and catch-up (light)

- Push `k8s/` to `cloud-native-lab/week-17`. You can stop the cluster's nodes to save memory with `docker stop lab-control-plane lab-worker lab-worker2`, and start them again later.

---

## Week 18: Configuration, health probes, storage, and stateful apps

**By the end of the week:** the whole StudyHub stack on Kubernetes: the API and worker configured with ConfigMaps and Secrets, with probes and resource limits, plus MongoDB as a StatefulSet with persistent storage, Valkey, and a nightly CronJob.

### Day 1: ConfigMaps and Secrets

**Learn (~20 min)**
- [ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/) and [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)

**Do**
```bash
kubectl create configmap studyhub-config \
  --from-literal=ConnectionStrings__Valkey="valkey:6379,abortConnect=false" \
  --from-literal=DynamoDb__ServiceUrl="http://dynamodb:8000"
kubectl create secret generic studyhub-secrets \
  --from-literal=ConnectionStrings__Mongo="mongodb://studyhub:change-me@mongo-0.mongo:27017/studyhub?authSource=admin"
kubectl get secret studyhub-secrets -o jsonpath='{.data}' | jq   # base64, not encrypted
```
In the Deployment, load both with `envFrom: [{ configMapRef: { name: studyhub-config } }, { secretRef: { name: studyhub-secrets } }]`.

**Done when:** the pods get their settings from the ConfigMap and Secret, and you can explain why a Kubernetes Secret is only base64-encoded unless the cluster encrypts it at rest.

### Day 2: Health probes and resources

**Topic:** a **readiness** probe says "send me traffic", a **liveness** probe says "restart me if I'm stuck", and a **startup** probe gives slow starters time. Requests and limits tell the scheduler what a pod needs, and stop it using too much.

**Learn (~20 min)**
- [Configure liveness, readiness, and startup probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/) and [Resource management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Health checks in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks) (Microsoft Learn)

**Do**
1. In StudyHub, add `builder.Services.AddHealthChecks()` with a check that pings MongoDB and Valkey, tagged `ready`. Map `/healthz/live` (no checks, just "the process works") and `/healthz/ready` (only the `ready` checks).
2. Add to the container spec:
   ```yaml
   readinessProbe: { httpGet: { path: /healthz/ready, port: 8080 }, periodSeconds: 5, failureThreshold: 3 }
   livenessProbe:  { httpGet: { path: /healthz/live,  port: 8080 }, periodSeconds: 10, failureThreshold: 3 }
   startupProbe:   { httpGet: { path: /healthz/live,  port: 8080 }, periodSeconds: 2,  failureThreshold: 30 }
   resources:
     requests: { cpu: 100m, memory: 128Mi }
     limits:   { memory: 256Mi }
   ```
3. Scale Valkey to zero once it exists (tomorrow) and watch pods become `0/1 READY`, but not restart.

**Done when:** pods only receive traffic when their dependencies work, and you can explain why liveness doesn't check the database.

### Day 3: Persistent storage and a MongoDB StatefulSet

**Topic:** a StatefulSet gives each pod a stable name (`mongo-0`) and its own PersistentVolumeClaim that follows it across restarts. kind's default StorageClass creates volumes on the node.

**Learn (~20 min)**
- [Persistent volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/) and [StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)

**Do:** create `k8s/mongo.yaml` with a headless Service and a one-replica StatefulSet:
```yaml
apiVersion: v1
kind: Service
metadata: { name: mongo }
spec: { clusterIP: None, selector: { app: mongo }, ports: [{ port: 27017 }] }
---
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: mongo }
spec:
  serviceName: mongo
  replicas: 1
  selector: { matchLabels: { app: mongo } }
  template:
    metadata: { labels: { app: mongo } }
    spec:
      containers:
        - name: mongo
          image: mongo:8
          env:
            - { name: MONGO_INITDB_ROOT_USERNAME, value: studyhub }
            - { name: MONGO_INITDB_ROOT_PASSWORD, valueFrom: { secretKeyRef: { name: mongo-root, key: password } } }
          ports: [{ containerPort: 27017 }]
          volumeMounts: [{ name: data, mountPath: /data/db }]
  volumeClaimTemplates:
    - metadata: { name: data }
      spec: { accessModes: [ReadWriteOnce], resources: { requests: { storage: 1Gi } } }
```
Create the `mongo-root` secret first, apply the file, then insert a document, delete `mongo-0`, and check the data is still there after it comes back.

**Done when:** MongoDB data survives the pod being deleted, and `kubectl get pvc` shows the claim bound.

### Day 4: Valkey, DynamoDB Local, and the worker

**Do:** write `k8s/valkey.yaml` (a Deployment and a Service named `valkey`), `k8s/dynamodb.yaml` (the same for `amazon/dynamodb-local`, with a Service named `dynamodb` on port 8000), and `k8s/worker.yaml` (a Deployment for `StudyHub.Worker`, using the same ConfigMap and Secret, with no Service). Load the worker image with `kind load docker-image`. Create the DynamoDB table with a one-off pod:
```bash
kubectl run ddb-init --rm -it --restart=Never --image=amazon/aws-cli \
  --env AWS_ACCESS_KEY_ID=local --env AWS_SECRET_ACCESS_KEY=local --env AWS_REGION=us-east-1 -- \
  dynamodb create-table --endpoint-url http://dynamodb:8000 --table-name studyhub-events \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE --billing-mode PAY_PER_REQUEST
```
Then run your Week 14 `smoke-test.sh` against `localhost:30080`.

**Done when:** the smoke test passes against the cluster.

### Day 5: Jobs and CronJobs

**Learn (~15 min)**
- [Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/) and [CronJobs](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)

**Do**
1. Run your Week 12 `StudyHub.Seed` app as a Job with `restartPolicy: Never` and `backoffLimit: 2`, and check its logs with `kubectl logs job/studyhub-seed`.
2. Add a CronJob that runs every 5 minutes and calls `POST /admin/reports/rebuild` using `curlimages/curl`. Set `concurrencyPolicy: Forbid` and `successfulJobsHistoryLimit: 3`.

**Done when:** the seed Job completes, and the CronJob has run at least twice.

### Day 6: Mini project, the whole stack from one folder

**Do:** put every manifest in `k8s/base/`. Add a `kustomization.yaml` that lists them and sets `namespace: studyhub` and common labels, then:
```bash
kubectl create namespace studyhub
kubectl apply -k k8s/base
kubectl get all -n studyhub
```
Delete the namespace and recreate it all with one command, timing it.

**Done when:** `kubectl apply -k k8s/base` brings up the whole working stack from nothing.

### Day 7: Review and catch-up (light)

- Push `k8s/` to `cloud-native-lab/week-18`.

---

## Week 19: Gateway API, Helm, and autoscaling

**By the end of the week:** StudyHub reachable through a Gateway with path routing, packaged as a Helm chart with values per environment, and scaling automatically with load.

**Why Gateway API, not Ingress NGINX:** the Kubernetes project retired the community Ingress NGINX controller in March 2026, with no more security fixes. Gateway API is its successor, supported by many controllers. This plan uses Envoy Gateway.

### Day 1: Gateway API concepts

**Learn (~20 min)**
- [Gateway API](https://kubernetes.io/docs/concepts/services-networking/gateway/) (Kubernetes docs)
- [Ingress NGINX retirement](https://www.kubernetes.dev/blog/2025/11/12/ingress-nginx-retirement/) (Kubernetes blog)

**Do:** draw how a request flows: GatewayClass (which controller), Gateway (the listener, run by the platform team), HTTPRoute (the app's routing rules, owned by the app team), then the Service and its pods.

**Done when:** you can say who owns each of the three resources, and why splitting them helps.

### Day 2: Envoy Gateway on kind

**Learn (~10 min)**
- [Envoy Gateway quickstart](https://gateway.envoyproxy.io/docs/tasks/quickstart/)

**Do**
1. Install Envoy Gateway with Helm, using the version from the quickstart page:
   ```bash
   helm install eg oci://docker.io/envoyproxy/gateway-helm --version <version from the docs> -n envoy-gateway-system --create-namespace
   kubectl wait --timeout=5m -n envoy-gateway-system deployment/envoy-gateway --for=condition=Available
   ```
2. Create a GatewayClass, a Gateway listening on port 80, and an HTTPRoute that sends `/api` to the StudyHub Service with a `URLRewrite` filter removing the prefix.
3. kind has no cloud load balancer, so reach the Gateway with port forwarding:
   ```bash
   kubectl -n envoy-gateway-system port-forward svc/$(kubectl -n envoy-gateway-system get svc -o name | grep envoy-default | cut -d/ -f2) 8888:80
   curl localhost:8888/api/lessons
   ```

**Done when:** requests through the Gateway reach StudyHub.

### Day 3: Traffic splitting

**Do:** deploy `studyhub-v2` (your `studyhub:6` image, with a changed `/` message) as a second Deployment and Service. In the HTTPRoute, use `backendRefs` weights of 90 and 10, then send 100 requests and count the answers. Move to 50/50, then 0/100. This is a canary release.

**Done when:** the split you set matches roughly what you measure.

### Day 4: Helm charts

**Learn (~20 min)**
- [Helm: chart template guide](https://helm.sh/docs/chart_template_guide/getting_started/)

**Do**
1. `helm create charts/studyhub`, then replace its templates with your Deployment, Service, ConfigMap, and HTTPRoute.
2. Move everything that changes per environment into `values.yaml`: image tag, replicas, resources, connection settings, and the route hostname.
3. Check and install it:
   ```bash
   helm lint charts/studyhub
   helm template charts/studyhub | less
   helm install studyhub charts/studyhub -n studyhub
   helm upgrade studyhub charts/studyhub -n studyhub --set image.tag=6
   helm history studyhub -n studyhub; helm rollback studyhub 1 -n studyhub
   ```
4. Create `values-dev.yaml` (1 replica, small resources) and `values-prod.yaml` (3 replicas, bigger resources). You'll use the prod file on EKS.

**Done when:** you can install, upgrade, and roll back StudyHub with Helm, with different values per environment.

### Day 5: Autoscaling with the Horizontal Pod Autoscaler

**Learn (~15 min)**
- [Horizontal Pod Autoscaling](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/)

**Do**
1. Install metrics-server. On kind, it needs one extra flag:
   ```bash
   helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
   helm install metrics-server metrics-server/metrics-server -n kube-system --set args={--kubelet-insecure-tls}
   kubectl top nodes; kubectl top pods -n studyhub
   ```
2. Add an HPA to your chart: 2 to 8 replicas, targeting 60% CPU. It needs the CPU **request** you set in Week 18.
3. Run k6 with 50 users against the Gateway for 3 minutes, and watch `kubectl get hpa -n studyhub -w`.

**Done when:** pods scale up under load and back down a few minutes after it stops.

### Day 6: Mini project, safe releases

**Do:** add to your chart:
- a PodDisruptionBudget with `minAvailable: 1`, so draining a node can't take all pods down
- `topologySpreadConstraints`, to spread pods across nodes
- a `preStop` sleep of 5 seconds and `terminationGracePeriodSeconds: 30`, so pods finish their requests before stopping

Then drain a worker with `kubectl drain lab-worker --ignore-daemonsets --delete-emptydir-data` while your curl loop runs, and uncordon it afterwards.

**Done when:** draining a node causes no failed requests.

### Day 7: Review and catch-up (light)

- Push `charts/` to `cloud-native-lab/week-19`.

---

## Week 20: Security and troubleshooting

**By the end of the week:** StudyHub locked down with RBAC, network policies, and Pod Security Standards, with telemetry flowing from the cluster, and the troubleshooting skills to fix the common failures quickly.

### Day 1: Service accounts and RBAC

**Learn (~20 min)**
- [Using RBAC authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

**Do**
1. Create a `studyhub` ServiceAccount, and set `automountServiceAccountToken: false` on the pods that don't need the API.
2. Create a Role allowing only `get`, `list`, and `watch` on pods in the `studyhub` namespace, and bind it to a `viewer` ServiceAccount.
3. Test it: `kubectl auth can-i delete pods -n studyhub --as=system:serviceaccount:studyhub:viewer` should say `no`, and `list` should say `yes`.

**Done when:** `kubectl auth can-i` confirms the viewer can read but not change anything.

### Day 2: Network policies

**Topic:** by default every pod can reach every other pod. A NetworkPolicy limits traffic to what's needed.

**Learn (~20 min)**
- [Network policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

**Do**
1. Add a default-deny ingress policy for the `studyhub` namespace.
2. Allow the Gateway to reach the API, the API and worker to reach MongoDB, Valkey, and DynamoDB, and nothing else.
3. Test with a throwaway pod: `kubectl run probe -n studyhub --rm -it --image=busybox -- wget -qO- -T 3 http://mongo:27017` should time out, while the API still works.

Recent kind versions enforce NetworkPolicy with their built-in network plugin. If your test isn't blocked, check your kind version, or recreate the cluster with Calico as described in the kind docs.

**Done when:** a random pod can't reach MongoDB, but StudyHub still works end to end.

### Day 3: Pod security

**Learn (~20 min)**
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/) and [Configure a security context](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)

**Do**
1. Label the namespace to enforce the `restricted` standard: `kubectl label ns studyhub pod-security.kubernetes.io/enforce=restricted`.
2. Watch which pods are now rejected (`kubectl get events -n studyhub`), and fix each one with a securityContext:
   ```yaml
   securityContext:
     runAsNonRoot: true
     allowPrivilegeEscalation: false
     readOnlyRootFilesystem: true
     capabilities: { drop: [ALL] }
     seccompProfile: { type: RuntimeDefault }
   ```
   StudyHub's chiseled image already runs as non-root. For `readOnlyRootFilesystem`, mount an `emptyDir` at `/tmp`. Third-party images like MongoDB may need the `baseline` level instead; note which and why.

**Done when:** StudyHub's own pods pass the `restricted` standard.

### Day 4: Telemetry from the cluster

**Do**
1. Deploy your Week 16 OpenTelemetry Collector into the cluster (the [official Helm chart](https://github.com/open-telemetry/opentelemetry-helm-charts/tree/main/charts/opentelemetry-collector) in `deployment` mode), with the same pipelines.
2. Run Jaeger and Prometheus in the cluster too, or keep them in Docker Compose and point the Collector at them through `host.docker.internal`.
3. Set `OTEL_EXPORTER_OTLP_ENDPOINT` in your chart to the Collector Service, and add `k8s.pod.name` and `k8s.namespace.name` to the resource attributes with the Collector's `k8sattributes` processor.

**Done when:** traces from the cluster show which pod handled each request.

### Day 5: Troubleshooting drill

**Learn (~15 min)**
- [Debug running pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/)

**Do:** cause each failure, fix it using only `kubectl get`, `describe`, `logs`, `events`, and `debug`, and write down the symptom and the fix:
1. **ImagePullBackOff:** set the image to a tag that doesn't exist.
2. **CrashLoopBackOff:** set an invalid MongoDB connection string, and read `kubectl logs --previous`.
3. **Pending:** request 64 CPUs.
4. **Running but not Ready:** break the readiness endpoint's dependency.
5. **Service with no endpoints:** change the Service selector to a label that doesn't match. Check with `kubectl get endpointslices`.
6. **OOMKilled:** set the memory limit to 32Mi.

**Done when:** you have a six-row table of symptom, command that showed the cause, and fix.

### Day 6: Mini project, a cluster runbook

**Do:** write `k8s/RUNBOOK.md` for StudyHub on Kubernetes: how to deploy, roll back, scale, read logs and traces, the six failures from Day 5, and how to restore MongoDB data from a backup. Make a backup with `kubectl exec mongo-0 -n studyhub -- mongodump --archive --gzip > backup.gz`, then restore it into a fresh cluster to prove the steps work.

**Done when:** you've restored StudyHub's data into a new cluster by following only your runbook.

### Day 7: Review and catch-up (light)

- Push to `cloud-native-lab/week-20`. Section F is complete. Mark the topics on [roadmap.sh/kubernetes](https://roadmap.sh/kubernetes).
- Keep the kind cluster. You'll use it again for Datadog in Week 25.
