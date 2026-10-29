# Section I: Capstone (Week 26)

One week to finish **StudyHub 1.0**: everything from the last 25 weeks working together, documented well enough for someone else to run, and demoed. Nothing new to learn.

**What 1.0 must do** (the week each part was built is in brackets):
- run as a small, non-root, scanned container image, built for x64 and ARM64 (Weeks 6–7)
- cache with output caching and HybridCache over Valkey, with measured hit ratios (Weeks 8–10)
- store lessons and progress in MongoDB, the leaderboard and streaks in Valkey, and session events in DynamoDB (Weeks 11–14)
- send OpenTelemetry traces, metrics, and logs (Weeks 15–16)
- deploy to Kubernetes with Helm, with probes, autoscaling, network policies, and Pod Security (Weeks 17–20)
- deploy to EKS Auto Mode with Pod Identity, ElastiCache, and a public load balancer, and tear down cleanly (Weeks 21–23)
- be monitored with dashboards, monitors, and an SLO (Weeks 16 and 24–25)

**Review resources:** the [Kubernetes production best practices](https://kubernetes.io/docs/setup/best-practices/), the [EKS Best Practices Guide](https://docs.aws.amazon.com/eks/latest/best-practices/introduction.html), and AlgoMaster's [System Design](https://algomaster.io/learn/system-design).

---

## Week 26: StudyHub 1.0

**By the end of the week:** StudyHub 1.0 released, running locally, on kind, and on EKS, with a README, an architecture diagram, runbooks, and a recorded demo.

### Day 1: Gap check

**Do:** go through the 1.0 list above. For each item, run it and mark it **works**, **partly works**, or **missing**, in `CAPSTONE.md`. Order the fixes by importance.

**Done when:** you have an ordered fix list for Days 2–3.

### Day 2: Fix the gaps

**Do:** work through the list. After each fix, run the smoke test from Week 14 against Compose and against kind.

**Done when:** the top half of your list is fixed, and both smoke tests pass.

### Day 3: Finish the gaps, and harden

**Do:** finish the list. Then check the hardening items: no secrets in Git (`git log -p | grep -i -E "api[_-]?key|password|secret"`), every image scanned, every pod passing the `restricted` Pod Security level or with the exception written down, and every AWS resource tagged. Anything you can't finish goes into a "Known limitations" section, with a reason.

**Done when:** every 1.0 item works, or is listed as a known limitation.

### Day 4: The architecture document

**Do:** write `ARCHITECTURE.md`, covering:
- a diagram: clients, the Gateway or load balancer, the API and worker, Valkey, MongoDB, DynamoDB, and the telemetry path
- why each data store was chosen (link `nosql/CHOOSING.md`)
- the caching design (link `caching/DESIGN.md`) and its measured results
- how it runs locally, on kind, and on EKS, and what differs between them
- the cost of one hour on EKS, from your Cost Explorer numbers

**Done when:** a new engineer could understand StudyHub from this document in 20 minutes.

### Day 5: Release on EKS, and record the demo

**Do**
1. Tag release `v1.0.0`, and let your Week 23 GitHub Actions workflow build and push the images.
2. Bring EKS up with `up.sh`, and deploy `v1.0.0`.
3. Record a 5–8 minute demo: the API working through the public URL, the leaderboard updating, a trace from API to worker, the cache hit ratio dashboard, scaling under k6 load, and the clean teardown with `down.sh`.

**Done when:** the demo video is linked from the README, and `cleanup-check.sh` shows nothing left running.

### Day 6: Look back, and plan what's next

**Do**
1. Open the schedule, and check that every week's roadmap.sh topics are marked. Then open each roadmap ([Linux](https://roadmap.sh/linux), [Docker](https://roadmap.sh/docker), [Kubernetes](https://roadmap.sh/kubernetes), [MongoDB](https://roadmap.sh/mongodb), [Redis](https://roadmap.sh/redis), and [AWS](https://roadmap.sh/aws)), and note the topics you haven't touched.
2. Pick your next step. Options include the CKAD or CKA Kubernetes exams, the AWS Certified Developer or DevOps Engineer exam, GitOps with Argo CD, a service mesh, or Karpenter in depth. Write a 6–12 week plan for it in the same format as this one.

**Done when:** you have an honest list of strengths and gaps, and a plan for what's next.

### Day 7: Shut down and celebrate (light)

- Run `cleanup-check.sh` and look at Cost Explorer one last time. Stop or delete the `lab1` VM (`multipass delete lab1 && multipass purge`) if you don't need it.
- Push everything to `cloud-native-lab`, and pin the repository on your GitHub profile.
- You've finished the plan.
