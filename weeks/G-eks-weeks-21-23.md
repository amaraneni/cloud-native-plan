# Section G: Amazon EKS (Weeks 21–23)

EKS is AWS's managed Kubernetes. With **EKS Auto Mode**, AWS also runs the nodes, load balancing, and storage for you, so you mostly just deploy workloads. Your Section F manifests and Helm chart work here with small changes. What's new is the AWS side: IAM, networking, load balancers, ECR, and managed services such as ElastiCache.

**Cost rules for this section (read before Day 1):**
- An EKS cluster costs money every hour it exists, whether or not anything runs on it: about $0.10 an hour for the cluster, plus an Auto Mode management fee on each node, the EC2 nodes themselves, a NAT gateway, and any load balancers. Check today's prices on the [EKS pricing page](https://aws.amazon.com/eks/pricing/) and the [ElastiCache pricing page](https://aws.amazon.com/elasticache/pricing/).
- **Create the cluster at the start of a session and delete it at the end.** Each day below starts with "create" and ends with "delete" where a cluster is needed. A forgotten cluster costs roughly $5–10 a day.
- Before Day 1, set an AWS budget of $25 a month with email alerts at 50%, 80%, and 100%.
- Use one region, `us-east-1`, and tag everything with `project=cloud-native-lab`.
- If you've done the AI Engineering plan, reuse its AWS setup (IAM Identity Center, the `learn` CLI profile, and the budget). If not, Week 21 Day 1 covers the minimum.

**Courses for this section (optional, see [resources.md](../resources.md)):** the free [EKS Workshop](https://www.eksworkshop.com/), and Udemy's [AWS EKS Kubernetes Masterclass](https://www.udemy.com/course/aws-eks-kubernetes-masterclass-devops-microservices/).
**roadmap.sh:** [AWS](https://roadmap.sh/aws) and [Kubernetes](https://roadmap.sh/kubernetes) (managed providers).

---

## Week 21: Your first EKS Auto Mode cluster, and ECR

**By the end of the week:** StudyHub's images in Amazon ECR, and StudyHub running on an EKS Auto Mode cluster that you can create and delete with one command each.

### Day 1: Account safety and tools

**Learn (~20 min)**
- [Set up to use Amazon EKS](https://docs.aws.amazon.com/eks/latest/userguide/setting-up.html) (AWS docs)

**Do (Ubuntu)**
1. If you don't have one yet, create an AWS budget of $25 with alerts, and a daily-use sign-in through IAM Identity Center (never use the root user for daily work). Configure the CLI with `aws configure sso` (profile `learn`, region `us-east-1`), then `export AWS_PROFILE=learn` and `aws sts get-caller-identity`.
2. Install `eksctl` version 0.195.0 or later from the [eksctl install page](https://docs.aws.amazon.com/eks/latest/eksctl/installation.html), then check `eksctl version`.
3. Write `aws/cleanup-check.sh`, which lists anything that costs money while idle:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   echo "EKS clusters:";        aws eks list-clusters --query clusters --output text
   echo "Load balancers:";      aws elbv2 describe-load-balancers --query 'LoadBalancers[].LoadBalancerName' --output text
   echo "NAT gateways:";        aws ec2 describe-nat-gateways --filter Name=state,Values=available --query 'NatGateways[].NatGatewayId' --output text
   echo "Running instances:";   aws ec2 describe-instances --filters Name=instance-state-name,Values=running --query 'Reservations[].Instances[].InstanceId' --output text
   echo "ElastiCache caches:";  aws elasticache describe-serverless-caches --query 'ServerlessCaches[].ServerlessCacheName' --output text
   ```
   Run it now, and at the end of every AWS day.

**Done when:** your budget alert is set, and the cleanup script runs and shows nothing.

### Day 2: Push StudyHub to ECR

**Learn (~15 min)**
- [Pushing a Docker image to ECR](https://docs.aws.amazon.com/AmazonECR/latest/userguide/docker-push-ecr-image.html)

**Do**
```bash
account=$(aws sts get-caller-identity --query Account --output text)
registry="$account.dkr.ecr.us-east-1.amazonaws.com"
for repo in studyhub-api studyhub-worker; do
  aws ecr create-repository --repository-name $repo --image-scanning-configuration scanOnPush=true \
    --tags Key=project,Value=cloud-native-lab >/dev/null
done
aws ecr get-login-password | docker login --username AWS --password-stdin "$registry"
docker buildx build --platform linux/amd64,linux/arm64 -t "$registry/studyhub-api:0.6.0" --push ./StudyHub.Api
docker buildx build --platform linux/amd64,linux/arm64 -t "$registry/studyhub-worker:0.6.0" --push ./StudyHub.Worker
aws ecr describe-image-scan-findings --repository-name studyhub-api --image-id imageTag=0.6.0 --query 'imageScanFindings.findingSeverityCounts'
```
Also add a lifecycle policy that keeps only the 10 newest images, so storage doesn't grow forever.

**Done when:** both images are in ECR for both CPU types, with scan results.

### Day 3: Create an EKS Auto Mode cluster

**Learn (~20 min)**
- [Automate cluster infrastructure with EKS Auto Mode](https://docs.aws.amazon.com/eks/latest/userguide/automode.html) and [Create an Auto Mode cluster with eksctl](https://docs.aws.amazon.com/eks/latest/userguide/automode-get-started-eksctl.html)

**Do**
1. Create `eks/cluster.yaml`, so the cluster is defined in Git:
   ```yaml
   apiVersion: eksctl.io/v1alpha5
   kind: ClusterConfig
   metadata:
     name: lab
     region: us-east-1
     tags: { project: cloud-native-lab }
   autoModeConfig:
     enabled: true
   ```
2. Create it. This takes about 15 minutes, and **billing starts now**:
   ```bash
   eksctl create cluster -f eks/cluster.yaml
   kubectl get nodes          # often none at first: Auto Mode adds nodes when pods need them
   kubectl get nodepools      # the built-in general-purpose and system pools
   ```
3. Deploy a test pod, `kubectl create deployment hello --image=nginx --replicas=2`, and watch a node appear with `kubectl get nodes -w`.
4. **Delete the cluster** at the end of the session: `eksctl delete cluster -f eks/cluster.yaml`, then run `cleanup-check.sh`.

**Done when:** you've seen Auto Mode add a node for your pods, and the cluster is deleted.

### Day 4: How Auto Mode differs from kind

**Learn (~20 min)**
- [EKS Auto Mode best practices](https://docs.aws.amazon.com/eks/latest/best-practices/automode.html)

**Do (create the cluster first)**
1. Look at what AWS runs for you: `kubectl get nodes -o wide` (the instance types), `kubectl get pods -A` (very few system pods, because AWS runs them off the nodes), and `kubectl describe nodepool general-purpose`.
2. Add a StorageClass for EBS volumes, which Auto Mode provides through its own driver:
   ```yaml
   apiVersion: storage.k8s.io/v1
   kind: StorageClass
   metadata:
     name: auto-ebs
     annotations: { storageclass.kubernetes.io/is-default-class: "true" }
   provisioner: ebs.csi.eks.amazonaws.com
   volumeBindingMode: WaitForFirstConsumer
   parameters: { type: gp3, encrypted: "true" }
   ```
3. Compare with kind in `eks/NOTES.md`: who manages nodes, storage, load balancers, upgrades, and costs.
4. **Delete the cluster.**

**Done when:** your comparison notes are written and the cluster is deleted.

### Day 5: StudyHub on EKS

**Do (create the cluster first)**
1. Apply the StorageClass from Day 4, then install your Helm chart from Week 19 with ECR images. Keep MongoDB, Valkey, and DynamoDB Local in the cluster for now; Week 22 moves Valkey and DynamoDB to AWS services:
   ```bash
   kubectl create namespace studyhub
   kubectl apply -k k8s/base                      # data services (MongoDB now uses an EBS volume)
   helm install studyhub charts/studyhub -n studyhub -f charts/studyhub/values-prod.yaml \
     --set image.repository=$registry/studyhub-api --set image.tag=0.6.0
   kubectl get pods,pvc -n studyhub
   kubectl port-forward -n studyhub svc/studyhub 5080:80
   ```
2. Run your smoke test against `localhost:5080`.
3. **Delete the cluster.**

**Done when:** the smoke test passes on EKS, and MongoDB's data lives on an EBS volume.

### Day 6: Mini project, one-command up and down

**Do:** write `eks/up.sh` and `eks/down.sh`:
- `up.sh` creates the cluster from `cluster.yaml`, applies the StorageClass and `k8s/base`, installs the Helm chart, waits for pods to be ready, and runs the smoke test.
- `down.sh` uninstalls Helm releases first (so their load balancers and volumes are removed), deletes the cluster, then runs `cleanup-check.sh` and fails if anything is left.

Time both scripts.

**Done when:** you can bring the whole environment up and down with two commands, and `down.sh` proves nothing is left running.

### Day 7: Review and catch-up (light)

- Push `eks/` to `cloud-native-lab/week-21`. Check Cost Explorer: this week should have cost a few dollars.

---

## Week 22: AWS integrations

**By the end of the week:** StudyHub on EKS using real AWS services, with DynamoDB access through EKS Pod Identity (no keys), ElastiCache Serverless for Valkey, a public load balancer, and secrets from AWS Secrets Manager.

### Day 1: EKS Pod Identity and a real DynamoDB table

**Topic:** pods should get AWS permissions from an IAM role, never from access keys. EKS Pod Identity links a Kubernetes ServiceAccount to an IAM role, and the AWS SDK picks up the credentials automatically.

**Learn (~20 min)**
- [Learn how EKS Pod Identity grants pods access to AWS services](https://docs.aws.amazon.com/eks/latest/userguide/pod-identities.html)

**Do (create the cluster with `up.sh` first)**
1. Create the real table, on demand, with the same keys as Week 14: run the Week 14 `create-table` command without `--endpoint-url`, and add `--tags Key=project,Value=cloud-native-lab`.
2. Create an IAM policy that allows only `dynamodb:PutItem` and `dynamodb:Query` on that table and its index, then link it to StudyHub's ServiceAccount:
   ```bash
   eksctl create podidentityassociation --cluster lab --namespace studyhub \
     --service-account-name studyhub --permission-policy-arns arn:aws:iam::$account:policy/studyhub-dynamodb
   ```
3. Remove `DynamoDb__ServiceUrl` from the ConfigMap, so the SDK uses the real service, and restart the pods.
4. Post a session, and check the item in the DynamoDB console.

**Done when:** StudyHub writes to real DynamoDB with no AWS keys anywhere in the cluster. **Delete the cluster** with `down.sh`.

### Day 2: A public load balancer

**Learn (~20 min)**
- [Quickstart: Deploy a web app and store data](https://docs.aws.amazon.com/eks/latest/userguide/quickstart.html), the load balancer part (AWS docs)

**Do (create the cluster first)**
1. Create an IngressClassParams and IngressClass for Auto Mode's built-in Application Load Balancer support:
   ```yaml
   apiVersion: eks.amazonaws.com/v1
   kind: IngressClassParams
   metadata: { name: alb }
   spec: { scheme: internet-facing }
   ---
   apiVersion: networking.k8s.io/v1
   kind: IngressClass
   metadata: { name: alb }
   spec:
     controller: eks.amazonaws.com/alb
     parameters: { apiGroup: eks.amazonaws.com, kind: IngressClassParams, name: alb }
   ```
2. Add an Ingress to your chart, behind a `ingress.enabled` value, routing `/` to the StudyHub Service, with `ingressClassName: alb`.
3. Wait for the address (a few minutes), then call it: `curl http://$(kubectl get ingress -n studyhub studyhub -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')/lessons`.
4. **Delete the cluster.** `down.sh` uninstalls the chart first, which removes the load balancer.

**Done when:** StudyHub answers on a public AWS URL, and `cleanup-check.sh` shows no load balancer left afterwards.

### Day 3: ElastiCache Serverless for Valkey

**Topic:** ElastiCache runs Valkey for you, with patching, replication, and failover. The serverless option scales by itself and bills for data stored and requests. It's only reachable from inside its VPC, so it has to share the cluster's VPC.

**Learn (~20 min)**
- [Getting started with ElastiCache Serverless](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/GettingStarted.serverless-valkey.step1.html) (AWS docs)

**Do (create the cluster first)**
1. Find the cluster's VPC, private subnets, and the cluster security group:
   ```bash
   vpc=$(aws eks describe-cluster --name lab --query cluster.resourcesVpcConfig.vpcId --output text)
   sg=$(aws eks describe-cluster --name lab --query cluster.resourcesVpcConfig.clusterSecurityGroupId --output text)
   subnets=$(aws ec2 describe-subnets --filters Name=vpc-id,Values=$vpc Name=tag:kubernetes.io/role/internal-elb,Values=1 --query 'Subnets[].SubnetId' --output text)
   ```
2. Create the cache, allowing traffic from the cluster security group:
   ```bash
   aws elasticache create-serverless-cache --serverless-cache-name studyhub --engine valkey \
     --subnet-ids $subnets --security-group-ids $sg --tags Key=project,Value=cloud-native-lab
   aws elasticache describe-serverless-caches --serverless-cache-name studyhub --query 'ServerlessCaches[0].[Status,Endpoint.Address]'
   ```
3. ElastiCache Serverless requires TLS. Set the ConfigMap's `ConnectionStrings__Valkey` to `<endpoint>:6379,ssl=true,abortConnect=false`, remove the in-cluster Valkey, and restart StudyHub.
4. Run your k6 test through the load balancer, and compare the cache hit ratio with the in-cluster Valkey from Week 18.
5. **Delete the cache** (`aws elasticache delete-serverless-cache --serverless-cache-name studyhub`) **and the cluster.** Add the cache deletion to `down.sh`.

**Done when:** StudyHub's HybridCache and leaderboard run on ElastiCache, and `cleanup-check.sh` shows no cache left afterwards.

### Day 4: Secrets from AWS Secrets Manager

**Topic:** Kubernetes Secrets are only base64-encoded. With Secrets Manager, the secret is encrypted and managed in AWS, and StudyHub reads it at startup through its Pod Identity role.

**Learn (~15 min)**
- [AWS Secrets Manager: retrieve secrets in .NET](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_cache-net.html)

**Do**
1. Create a secret holding the MongoDB connection string: `aws secretsmanager create-secret --name studyhub/mongo --secret-string 'mongodb://...' --tags Key=project,Value=cloud-native-lab`.
2. Add `secretsmanager:GetSecretValue` for that one secret to the Pod Identity role's policy.
3. In StudyHub, when running in AWS, read it at startup with `AWSSDK.SecretsManager` and put it into configuration, before the MongoDB client is created.
4. Remove the connection string from the Kubernetes Secret, and check StudyHub still connects (with the cluster running).

**Done when:** no database password is stored in Kubernetes, and StudyHub still works. **Delete the cluster.**

### Day 5: Private networking and security groups

**Learn (~20 min)**
- [Amazon EKS networking](https://docs.aws.amazon.com/eks/latest/userguide/eks-networking.html)

**Do:** with the cluster running, answer these from the AWS console and CLI, and write them in `eks/NETWORK.md`:
- which subnets the nodes are in, and whether they're public or private
- how pods reach the internet (the NAT gateway) and how the internet reaches StudyHub (the load balancer)
- which security groups allow traffic from the load balancer to the nodes, and from the nodes to ElastiCache
- how much the NAT gateway costs per hour, and why it's there even when idle

**Done when:** you can trace a request from the internet to a pod and to ElastiCache on a diagram. **Delete the cluster.**

### Day 6: Mini project, StudyHub fully on AWS

**Do:** update `up.sh` to create, and `down.sh` to delete, everything StudyHub needs: the cluster, the DynamoDB table (keep it between sessions if you like; it costs nothing idle), the ElastiCache cache, the Pod Identity association, the secret, and the load balancer. Run the whole thing once, run k6 for 5 minutes through the public URL, then tear it all down.

**Done when:** `up.sh` gives you a public, working StudyHub on AWS services, and `down.sh` leaves nothing that costs money while idle.

### Day 7: Review and catch-up (light)

- Push to `cloud-native-lab/week-22`. Check Cost Explorer, and note this week's spend.

---

## Week 23: Operating EKS

**By the end of the week:** you've watched EKS scale nodes and pods under load, upgraded a cluster version, read logs in CloudWatch, deployed from GitHub Actions without stored keys, and written an operations guide with real cost numbers.

### Day 1: Node and pod scaling together

**Learn (~15 min)**
- [Create a node pool for EKS Auto Mode](https://docs.aws.amazon.com/eks/latest/userguide/create-node-pool.html)

**Do (create the environment with `up.sh`)**
1. Run k6 with 200 users through the load balancer for 5 minutes.
2. Watch the HPA add pods (`kubectl get hpa -n studyhub -w`) and Auto Mode add nodes when pods are `Pending` (`kubectl get nodes -w`).
3. Stop the load, and watch both scale back down. Note how long the nodes take to go away.
4. **Run `down.sh`.**

**Done when:** you've seen pods scale first, then nodes, and written down the timings.

### Day 2: A Spot node pool for the worker

**Topic:** Spot instances are spare EC2 capacity at a large discount, but AWS can take them back at short notice. They suit work that can be retried, like StudyHub's stream worker.

**Do (create the environment first)**
1. Create a NodePool that allows only Spot capacity, with a taint `workload=batch:NoSchedule`.
2. Give the worker Deployment a matching toleration and a node selector for that pool.
3. Check the worker's node with `kubectl get pods -n studyhub -o wide`, and its capacity type in `kubectl get nodes -L karpenter.sh/capacity-type`.
4. **Run `down.sh`.**

**Done when:** the worker runs on a Spot node, and the API stays on on-demand nodes.

### Day 3: Logs and metrics in CloudWatch

**Learn (~15 min)**
- [Send control plane logs to CloudWatch Logs](https://docs.aws.amazon.com/eks/latest/userguide/control-plane-logs.html)

**Do (create the environment first)**
1. Turn on the `api` and `audit` control plane logs in `cluster.yaml` under `cloudWatch.clusterLogging`, and recreate or update the cluster.
2. In CloudWatch Logs Insights, find who deleted a pod: `fields @timestamp, user.username, objectRef.name | filter verb = "delete" and objectRef.resource = "pods"`.
3. Point your in-cluster OpenTelemetry Collector (Week 20) at your Grafana stack, or keep using Jaeger by port-forwarding, so you still have traces on EKS.
4. Set the control plane log retention to 1 day, so logs don't cost you later. **Run `down.sh`.**

**Done when:** you've found a specific pod deletion in the audit logs.

### Day 4: Upgrading the cluster

**Learn (~20 min)**
- [Update an existing cluster to a new Kubernetes version](https://docs.aws.amazon.com/eks/latest/userguide/update-cluster.html)

**Do**
1. Set `metadata.version` in `cluster.yaml` to one version below the newest, and create the environment.
2. Check for removed APIs before upgrading, using the cluster insights: `aws eks list-insights --cluster-name lab`.
3. Upgrade one version: `eksctl upgrade cluster -f eks/cluster.yaml --approve`, with your curl loop running. Auto Mode replaces the nodes after the control plane upgrade.
4. Record how long it took and whether any requests failed. **Run `down.sh`.**

**Done when:** you've upgraded a cluster with StudyHub serving traffic, and written down what happened.

### Day 5: Deploy from GitHub Actions

**Learn (~20 min)**
- [Configuring OpenID Connect in Amazon Web Services](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws) (GitHub Docs)
- [Grant IAM users access to Kubernetes with EKS access entries](https://docs.aws.amazon.com/eks/latest/userguide/access-entries.html)

**Do (create the environment first)**
1. Create an IAM OIDC provider for GitHub and a `github-deploy` role that only your repository's `main` branch can assume, with permission to push to your ECR repositories and call `eks:DescribeCluster`.
2. Give that role access inside the cluster with an access entry: `aws eks create-access-entry --cluster-name lab --principal-arn <role ARN>`, then associate the `AmazonEKSEditPolicy` access policy with the scope set to the `studyhub` namespace only (`aws eks associate-access-policy ... --access-scope type=namespace,namespaces=studyhub`).
3. Add a workflow that, on a push to `main`, builds and pushes the image to ECR with the commit SHA as the tag, then runs `helm upgrade studyhub ... --set image.tag=<sha>`.
4. Push a change, watch the rollout, then **run `down.sh`**. Add the access entry to `up.sh`.

**Done when:** a push to `main` deploys to EKS with no AWS keys stored in GitHub.

### Day 6: Mini project, the EKS operations guide

**Do:** write `eks/OPERATIONS.md`, covering:
- how to bring the environment up and down, and how long each takes
- the cost of one hour of the full environment, broken down from Cost Explorer (use the `project` tag)
- scaling behavior and timings (Day 1), and when Spot is used (Day 2)
- the upgrade steps (Day 4)
- how deploys work (Day 5)
- what's different from kind, and which Section F runbook steps change on EKS

**Done when:** someone could run StudyHub on EKS from this guide alone.

### Day 7: Review and catch-up (light)

- Push to `cloud-native-lab/week-23`. Run `cleanup-check.sh` one more time. Section G is complete. Mark the topics on [roadmap.sh/aws](https://roadmap.sh/aws) and [roadmap.sh/kubernetes](https://roadmap.sh/kubernetes).
