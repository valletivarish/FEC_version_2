# fec_version_1

NCI H9FECC (Fog and Edge Computing) CA coursework portfolio. Brief: `FEC Project Descript.md`.

## AWS deployment guardrail

Project 22 (smart-waste-management) is deployed to a real AWS account:

- **Account ID: 548539235319** (AWS Academy Learner Lab, Vocareum-provisioned, student `x23432721@student.ncirl.ie`)
- Region: `us-east-1` only (this Learner Lab account is region-locked; other regions fail with a generic access-denied that looks like a permissions issue but is actually the region condition)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile — this account cannot create new IAM roles/users
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours; `aws configure` needs all three values (access key, secret key, session token) from the Learner Lab's "AWS Details" panel

**Before running any `aws`/deploy command in this repo: confirm `aws sts get-caller-identity` returns account `548539235319`.** If it returns a different account, STOP and flag it to the user rather than proceeding — do not deploy or modify resources in an account that wasn't explicitly confirmed for this project.

Live resources in this account (as of 2026-07-13, project 22 only): DynamoDB table `swm-readings`, SQS queue `swm-district-agg`, Lambda `swm-processor`, EC2 instance `i-022c30cf73b0c10db` (tagged `swm-dashboard-host`, public IP may change if the instance is stopped/restarted), S3 staging bucket `swm-deploy-548539235319`. All are prefixed `swm-` — that prefix is unique to project 22, safe to filter on for any cleanup or inventory check.

## Attribution

Some projects in this portfolio are individual CA submissions for different students, not all belonging to the same person:

- Project 15 (data-center-environmental-monitoring): Nithin, Student ID X25125338
- Project 22 (smart-waste-management): Gundeti Sachin Reddy, Student ID X23432721

Each such project's own `readme.txt` carries an ATTRIBUTION section with the same detail — check there before assuming a project belongs to the main portfolio owner.
