# fec_version_1

NCI H9FECC (Fog and Edge Computing) CA coursework portfolio. Brief: `FEC Project Descript.md`.

## Live URLs quick reference

All dashboard URLs re-checked live on 2026-07-15 (HTTP status of the index page). Full resource IDs and guardrails for each are in the per-project sections below. A structured, single-table copy of name/student ID/account ID/email/live URLs also lives at `student_deployments.csv` in the repo root, for quick lookups without reading prose.

| Project | Student | Dashboard | API | Status |
|---|---|---|---|---|
| 22 smart-waste-management | Gundeti Sachin Reddy | `https://swm-frontend-548539235319.s3.us-east-1.amazonaws.com/index.html` | `https://f721o30kd5.execute-api.us-east-1.amazonaws.com` | 200 OK |
| 15 data-center-environmental-monitoring | Nithin | `https://dce-frontend-373241496019.s3.us-east-1.amazonaws.com/index.html` | `https://nke958yhid.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 01 smart-agriculture | Chaitanya | `https://fec-agri-frontend-733939924597.s3.us-east-1.amazonaws.com/index.html` | `https://fjdi0s1wed.execute-api.us-east-1.amazonaws.com` | **BROKEN as of 2026-07-15: bucket returns `NoSuchBucket`** — likely the same "Learner Lab issued a different account" pattern seen on project 25, not yet investigated or redeployed since this is Chaitanya's own account and needs her fresh credentials |
| 23 marine-vessel-monitoring | Gopi Krishnan | `http://mvs-frontend-573065484152.s3-website-us-east-1.amazonaws.com/` | `https://3crovrzml6.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 24 wildlife-conservation-monitoring | Hrishikesh Sajeev | `https://wcm-frontend-670139527491.s3.us-east-1.amazonaws.com/index.html` | `https://oz61bjskyj.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 25 ski-resort-avalanche-safety (current) | Ebin Joseph | `https://ska-frontend-475393590440.s3.us-east-1.amazonaws.com/index.html` | `https://fl6fe76mlf.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 25 ski-resort-avalanche-safety (orphaned original) | Ebin Joseph | `https://ska-frontend-596691181085.s3.us-east-1.amazonaws.com/index.html` | `https://se2853uk5d.execute-api.us-east-1.amazonaws.com/prod` | orphaned, do not use |
| 19 smart-mining-safety | Jaipal Kasireddy | `https://msm-frontend-639210843493.s3.us-east-1.amazonaws.com/index.html` | `https://abkr6m4y99.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 07 warehouse-robotics-fleet | Goutham Uppu | `https://wrf-frontend-789399341650.s3.us-east-1.amazonaws.com/index.html` | `https://iodllqqk3m.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 21 bridge-structural-health | Kasireddy Vadicherla | `https://bshm-frontend-661886400169.s3.us-east-1.amazonaws.com/index.html` | `https://pe87xzlj3j.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 09 aquaculture-fish-farm | Anjaneya Reddy Gurram | `https://aff-frontend-713939620116.s3.us-east-1.amazonaws.com/index.html` | `https://245ef52rjf.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 06 offshore-wind-farm | Vishvaksen Machana | `https://owf-frontend-015611713565.s3.us-east-1.amazonaws.com/index.html` | `https://zwwf3aohya.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 20 smart-port-container-terminal | Uday Kiran Reddy Dodda | `https://spc-frontend-659211701832.s3.us-east-1.amazonaws.com/index.html` | `https://93xrytbtkb.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 13 ev-charging-network | Nemi Ishwarlal Vikani | `https://ecn-frontend-350600740537.s3.us-east-1.amazonaws.com/index.html` | `https://8fu3l2spz0.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 11 water-treatment-utility | Rakesh Kunchala | `https://wtu-frontend-824792629641.s3.us-east-1.amazonaws.com/index.html` | `https://p0ljcrhlj2.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 26 beehive-apiary-monitoring | Yashaswini Penumarthi | `https://bam-frontend-881865707591.s3.us-east-1.amazonaws.com/index.html` | `https://0hodaq59re.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 03 patient-vitals | Sri Venkat Bora | `https://fpv-frontend-457516959142.s3.us-east-1.amazonaws.com/index.html` | `https://s2unnfc535.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 04 smart-city | Mohammed Hassan Ahmed | `https://fsc-frontend-109730370597.s3.us-east-1.amazonaws.com/index.html` | `https://ckvirw3e01.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 05 cold-chain-logistics | Srinidhi Vutkoori | `https://fcl-frontend-911500555248.s3.us-east-1.amazonaws.com/index.html` | `https://zpeplbwe17.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 17 solar-farm-monitoring | Mahek Naaz | `https://sfm-frontend-263844967627.s3.us-east-1.amazonaws.com/index.html` | `https://c9wp9ylab7.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 02 industrial-equipment | Vikas Reddy Amanagantti | `https://fei-frontend-964346251483.s3.us-east-1.amazonaws.com/index.html` | `https://dfhmkyn2s5.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |
| 10 wildfire-forest-monitoring | Deekonda Rakshan | `https://wfm-frontend-923613097540.s3.us-east-1.amazonaws.com/index.html` | `https://qr6vnedh7g.execute-api.us-east-1.amazonaws.com/prod` | 200 OK |

## AWS deployment guardrail

**Terraform workspace guardrail (added 2026-07-16, near-miss on project 21's deploy):** the shared Terraform module's local `terraform/terraform.tfstate` uses the `default` workspace, which already tracks whichever project was deployed through it (currently project 07's `wrf-*` resources). Running `terraform apply -var-file=deployments/<new>.tfvars` directly against the `default` workspace would make Terraform plan to DESTROY that tracked project's live resources and replace them with the new project's, since the state and the var file would then disagree about what should exist. **Before ever running `terraform apply` via this shared module for a NEW project, always create and switch to a dedicated workspace first: `terraform workspace new <prefix>` (e.g. `terraform workspace new bshm`), confirm with `terraform workspace list` that you're on the new one, and only then apply.** Switch back to `default` afterward (`terraform workspace select default`) so the working directory doesn't default into the wrong workspace for the next person's command. Always run `terraform plan` before `apply` and read the "Plan: N to add, 0 to change, 0 to destroy" line — any nonzero destroy count against a shared module deploy is a stop-and-ask signal, not something to auto-approve past.

Project 22 (smart-waste-management) is deployed to a real AWS account:

- **Account ID: 548539235319** (AWS Academy Learner Lab, Vocareum-provisioned, student `x23432721@student.ncirl.ie`)
- Region: `us-east-1` only (this Learner Lab account is region-locked; other regions fail with a generic access-denied that looks like a permissions issue but is actually the region condition)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile (this account cannot create new IAM roles/users)
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours; `aws configure` needs all three values (access key, secret key, session token) from the Learner Lab's "AWS Details" panel
- Blocked services confirmed by direct testing (not just guessing): CloudFront (even read-only `cloudfront:ListDistributions` denied) and public/unauthenticated Lambda Function URLs (`AuthType: NONE` invocation returns Forbidden regardless of resource policy). API Gateway (HTTP API) is NOT blocked and works fine as the public-facing path in front of a Lambda.

**Before running any `aws`/deploy command in this repo: confirm `aws sts get-caller-identity` returns account `548539235319`.** If it returns a different account, STOP and flag it to the user rather than proceeding, do not deploy or modify resources in an account that wasn't explicitly confirmed for this project.

**This account is not a shared or general-purpose sandbox.** It is Gundeti Sachin Reddy's (X23432721) personal AWS Academy Learner Lab, provisioned under his own NCI student login. Project 22 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account — its live resources, credentials, and account ID are specific to his enrollment, not to the portfolio in general. Any other student's AWS work needs their own Learner Lab account and its own account-ID guardrail, not this one.

Live resources in this account (as of 2026-07-13, project 22 only): DynamoDB table `swm-readings`, SQS queue `swm-district-agg`, Lambda `swm-processor` (fog-dispatch consumer) and Lambda `swm-dashboard-api` (dashboard API, behind API Gateway `f721o30kd5`), EC2 instance `i-022c30cf73b0c10db` (tagged `swm-dashboard-host`, runs fog + 10 sensor containers only now), Elastic IP `54.204.136.193` (allocation `eipalloc-0d769166f544d0320`, associated with that instance so its public IP stays fixed across stop/start instead of changing each time), S3 bucket `swm-frontend-548539235319` (static dashboard frontend, public read-only) and S3 staging bucket `swm-deploy-548539235319`. All are prefixed `swm-` (that prefix is unique to project 22, safe to filter on for any cleanup or inventory check). The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://swm-frontend-548539235319.s3.us-east-1.amazonaws.com/index.html`, its API at `https://f721o30kd5.execute-api.us-east-1.amazonaws.com`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 15 (data-center-environmental-monitoring) is deployed to a separate real AWS account:

- **Account ID: 373241496019** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25125338@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as project 22's account — confirmed by testing `dynamodb:ListTables` in `eu-west-1`, which was denied)
- Role: `voclabs` (session), reuse `LabRole` for anything needing an IAM role or instance profile (this account also cannot create new IAM roles/users; confirmed the same `LabRole` exists here)
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as project 22's account

**Before running any `aws`/deploy command for project 15: confirm `aws sts get-caller-identity` returns account `373241496019`.** If it returns a different account (e.g. `548539235319`, project 22's account), STOP and flag it to the user — never deploy project 15 into project 22's account or vice versa, they are different students' own Learner Labs.

**This account is not a shared or general-purpose sandbox.** It is Nithin's (X25125338) personal AWS Academy Learner Lab. Project 15 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Live resources in this account (as of 2026-07-14, project 15 only): DynamoDB table `dce-readings`, SQS queue `dce-hall-agg`, Lambda `dce-processor` (SQS-triggered ingestion) and Lambda `dce-api` (Nithin's individually-required separate backend Lambda, behind API Gateway `nke958yhid`), EC2 instance `i-038b378b1b66821b1` (tagged `dce-fog-host`, runs the fog node + 10 sensor containers, security group `sg-0ffb82ac30841e509` allows only inbound TCP 8000, no SSH — administered via SSM only), Elastic IP `3.228.239.253` (allocation `eipalloc-0ca5f6a6fb6245667`, associated with that instance), S3 bucket `dce-frontend-373241496019` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `dce-deploy-373241496019` (used to ship source to the EC2 instance since this repo is private and can't be `git clone`d from there without embedding a token). All are prefixed `dce-`. The `dce-api` Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://dce-frontend-373241496019.s3.us-east-1.amazonaws.com/index.html`, its API at `https://nke958yhid.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 01 (smart-agriculture) is deployed to a separate real AWS account:

- **Account ID: 733939924597** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25171216@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other two accounts — confirmed by testing `dynamodb:ListTables` in `eu-west-1`, which was denied)
- Role: `voclabs` (session), reuse `LabRole` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other two accounts

**Before running any `aws`/deploy command for project 01: confirm `aws sts get-caller-identity` returns account `733939924597`.** If it returns a different account (e.g. `548539235319` or `373241496019`), STOP and flag it to the user — never deploy project 01 into another project's account or vice versa, they are three different students' own Learner Labs.

**This account is not a shared or general-purpose sandbox.** It is Kondragunta Lakshmi Chaitanya's (X25171216) personal AWS Academy Learner Lab. Project 01 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Resources as originally deployed (2026-07-14, not independently re-verified since): DynamoDB `fec-agri-readings`, SQS `fec-agri-agg`, Lambda `fec-agri-processor` + `fec-agri-dashboard-api` (behind API Gateway `fjdi0s1wed`), EC2 `i-04bfb4c32faa2fe8b` behind Elastic IP `18.235.14.218`, S3 `fec-agri-frontend-733939924597` + `fec-agri-deploy-733939924597`.

**Status as of 2026-07-15: the frontend bucket (`fec-agri-frontend-733939924597`) returns `NoSuchBucket`** — a public, unauthenticated check, so this is confirmed broken, not just inaccessible to us. Likely the same "Learner Lab issued a different account on a later session" pattern confirmed on project 25, but NOT YET VERIFIED — nobody has checked with Chaitanya's fresh credentials whether the account number changed, whether other resources (DynamoDB/SQS/Lambda/EC2) are still alive under the original account, or whether a full redeploy is needed. Do not assume this project's deployment is currently live until that check happens.

Project 23 (marine-vessel-monitoring) is deployed to a separate real AWS account:

- **Account ID: 573065484152** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25112627@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other three accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other three accounts

**Before running any `aws`/deploy command for project 23: confirm `aws sts get-caller-identity` returns account `573065484152`.** If it returns a different account (e.g. `548539235319`, `373241496019`, or `733939924597`), STOP and flag it to the user — never deploy project 23 into another project's account or vice versa, they are four different students' own Learner Labs.

**This account is not a shared or general-purpose sandbox.** It is Gopi Krishnan's (X25112627) personal AWS Academy Learner Lab. Project 23 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Live resources in this account (as of 2026-07-14, project 23 only): DynamoDB table `mvs-readings`, SQS queue `mvs-vessel-agg`, Lambda `mvs-processor` (SQS-triggered ingestion) and Lambda `mvs-dashboard-api` (dashboard API, behind API Gateway REST API `3crovrzml6`), EC2 instance `i-00cee8327e251f43d` (tagged `mvs-fog-host`, runs the fog node + 10 sensor containers, security group `sg-0237d7ef5cf8bf8c9` allows only inbound TCP 8000, no SSH, no key pair — administered via SSM only), Elastic IP `3.93.139.149` (allocation `eipalloc-080d56c695197faf4`, associated with that instance), S3 bucket `mvs-frontend-573065484152` (static dashboard frontend, public read-only) and S3 staging bucket `mvs-deploy-573065484152`. All are prefixed `mvs-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `http://mvs-frontend-573065484152.s3-website-us-east-1.amazonaws.com/`, its API at `https://3crovrzml6.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 24 (wildlife-conservation-monitoring) is deployed to a separate real AWS account:

- **Account ID: 670139527491** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25132377@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other four accounts — confirmed by testing `dynamodb:ListTables` in `eu-west-1`, which was denied)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other four accounts

**Before running any `aws`/deploy command for project 24: confirm `aws sts get-caller-identity` returns account `670139527491`.** If it returns a different account (e.g. `548539235319`, `373241496019`, `733939924597`, or `573065484152`), STOP and flag it to the user — never deploy project 24 into another project's account or vice versa, they are five different students' own Learner Labs.

**This account is not a shared or general-purpose sandbox.** It is Hrishikesh Sajeev's (X25132377) personal AWS Academy Learner Lab. Project 24 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Live resources in this account (as of 2026-07-14, project 24 only): DynamoDB table `wcm-readings`, SQS queue `wcm-reserve-agg`, Lambda `wcm-processor` (SQS-triggered ingestion, java17) and Lambda `wcm-dashboard-api` (WildlifeDashboardLambda, behind API Gateway REST API `oz61bjskyj`), EC2 instance `i-09f1eb11c14c2197a` (tag `wcm-fog-host`, runs the fog node + 10 sensor containers, security group `sg-0f357d4756b3436a2` allows only inbound TCP 8000, no SSH, no key pair — administered via SSM only), Elastic IP `44.216.37.203` (allocation `eipalloc-076fb8c006c1eda30`, associated with that instance), S3 bucket `wcm-frontend-670139527491` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `wcm-deploy-670139527491`. All are prefixed `wcm-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://wcm-frontend-670139527491.s3.us-east-1.amazonaws.com/index.html`, its API at `https://oz61bjskyj.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 25 (ski-resort-avalanche-safety) is deployed to a separate real AWS account:

- **Current account ID: 475393590440** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25142224@student.ncirl.ie`). This is a *replacement* account: the original Learner Lab session (account `596691181085`, deployed 2026-07-15) ended and a later "Start Lab" click issued a brand-new sandbox account instead of refreshing credentials for the same one, so project 25 was fully redeployed from scratch into `475393590440` the same day. The original account's resources are orphaned (not deleted, just unreachable without a session under that specific account ID) — see the "REDEPLOYMENT" note in `projects/25-ski-resort-avalanche-safety/readme.txt` for the full history and both sets of resource IDs/URLs.
- Region: `us-east-1` only (same region-lock pattern as the other five accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other five accounts

**Before running any `aws`/deploy command for project 25: confirm `aws sts get-caller-identity` returns account `475393590440`.** If it returns a different account (e.g. `548539235319`, `373241496019`, `733939924597`, `573065484152`, `670139527491`, or the now-orphaned `596691181085`), STOP and flag it to the user — never deploy project 25 into another project's account or vice versa, and never assume a Learner Lab session preserves the same account ID across restarts.

**This account is not a shared or general-purpose sandbox.** It is Ebin Joseph's (X25142224) personal AWS Academy Learner Lab. Project 25 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Live resources in this account (as of 2026-07-15, project 25 only, second/current deployment): DynamoDB table `ska-readings`, SQS queue `ska-slope-agg`, Lambda `ska-processor` (SQS-triggered ingestion) and Lambda `ska-dashboard-api` (behind API Gateway REST API `fl6fe76mlf`), EC2 instance `i-02485962a872245d9` (tagged `ska-fog-host`, runs the fog node + 10 sensor containers, security group `sg-043d59fbae6bca08f` allows only inbound TCP 8000, no SSH — administered via SSM only), Elastic IP `52.86.31.136` (allocation `eipalloc-026694ff3db3baee5`, associated with that instance), S3 bucket `ska-frontend-475393590440` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `ska-deploy-475393590440`. All are prefixed `ska-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs (current): dashboard at `https://ska-frontend-475393590440.s3.us-east-1.amazonaws.com/index.html`, its API at `https://fl6fe76mlf.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Original (now-orphaned) URLs, kept for record only, do not attempt to deploy/verify against them: dashboard at `https://ska-frontend-596691181085.s3.us-east-1.amazonaws.com/index.html`, its API at `https://se2853uk5d.execute-api.us-east-1.amazonaws.com/prod`.

Project 19 (smart-mining-safety) is deployed to a separate real AWS account:

- **Account ID: 639210843493** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25156381@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other six accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other six accounts

**Before running any `aws`/deploy command for project 19: confirm `aws sts get-caller-identity` returns account `639210843493`.** If it returns a different account (e.g. `548539235319`, `373241496019`, `733939924597`, `573065484152`, `670139527491`, or `596691181085`), STOP and flag it to the user — never deploy project 19 into another project's account or vice versa, they are seven different students' own Learner Labs.

**This account is not a shared or general-purpose sandbox.** It is Jaipal Kasireddy's (X25156381) personal AWS Academy Learner Lab. Project 19 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Live resources in this account (as of 2026-07-15, project 19 only): DynamoDB table `msm-readings`, SQS queue `msm-shaft-agg`, Lambda `msm-processor` (SQS-triggered ingestion, java17) and Lambda `msm-dashboard-api` (behind API Gateway REST API `abkr6m4y99`), EC2 instance `i-0375e6d48f131629c` (tagged `msm-fog-host`, runs the fog node + 10 sensor containers, security group `sg-0ca1a43089cff9bd7` allows only inbound TCP 8000, no SSH — administered via SSM only), Elastic IP `3.212.203.181` (allocation `eipalloc-03210b0f17e97b25f`, associated with that instance), S3 bucket `msm-frontend-639210843493` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `msm-deploy-639210843493`. All are prefixed `msm-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://msm-frontend-639210843493.s3.us-east-1.amazonaws.com/index.html`, its API at `https://abkr6m4y99.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 07 (warehouse-robotics-fleet) is deployed to a separate real AWS account:

- **Account ID: 789399341650** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25167936@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other seven accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other seven accounts

**Before running any `aws`/deploy command for project 07: confirm `aws sts get-caller-identity` returns account `789399341650`.** If it returns a different account (e.g. `548539235319`, `373241496019`, `733939924597`, `573065484152`, `670139527491`, `596691181085`/`475393590440`, or `639210843493`), STOP and flag it to the user — never deploy project 07 into another project's account or vice versa, they are eight different students' own Learner Labs. This account also has a "voc-cancel-cred" IAM deny policy attached whenever its Learner Lab session ends, which blocks every API call outright (not just a credential-expiry error) until a fresh session starts.

**This account is not a shared or general-purpose sandbox.** It is Goutham Uppu's (X25167936) personal AWS Academy Learner Lab. Project 07 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Live resources in this account (as of 2026-07-15, project 07 only, provisioned via `terraform/` in a single apply): DynamoDB table `wrf-readings`, SQS queue `wrf-fleet-agg`, Lambda `wrf-processor` (SQS-triggered ingestion, java17) and Lambda `wrf-dashboard-api` (behind API Gateway REST API `iodllqqk3m`), EC2 instance `i-00c6537b8a41e9750` (tagged `wrf-fog-host`, runs the fog node + 10 sensor containers, security group `sg-055b717ec8c67842f` allows only inbound TCP 8000), Elastic IP `3.211.126.248` (allocation `eipalloc-0f2deddeb44a81675`, associated with that instance), S3 bucket `wrf-frontend-789399341650` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `wrf-deploy-789399341650`. All are prefixed `wrf-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://wrf-frontend-789399341650.s3.us-east-1.amazonaws.com/index.html`, its API at `https://iodllqqk3m.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 21 (bridge-structural-health) is deployed to a separate real AWS account:

- **Account ID: 661886400169** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25104047@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other eight accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other eight accounts

**Before running any `aws`/deploy command for project 21: confirm `aws sts get-caller-identity` returns account `661886400169`.** If it returns a different account (e.g. `548539235319`, `373241496019`, `733939924597`, `573065484152`, `670139527491`, `596691181085`/`475393590440`, `639210843493`, or `789399341650`), STOP and flag it to the user — never deploy project 21 into another project's account or vice versa, they are nine different students' own Learner Labs.

**This account is not a shared or general-purpose sandbox.** It is Kasireddy Vadicherla's (X25104047) personal AWS Academy Learner Lab. Project 21 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Deployed via the shared Terraform module (`terraform/`, see its own section above) in a single `terraform apply` in an isolated `bshm` workspace — the local `terraform.tfstate` already tracked project 07's live resources under the `default` workspace, so a workspace switch (`terraform workspace new bshm`) was required before this apply to avoid planning a destroy of Goutham's resources. 24 resources created with zero manual AWS CLI steps.

Live resources in this account (as of 2026-07-16, project 21 only, provisioned via `terraform/`): DynamoDB table `bshm-readings`, SQS queue `bshm-span-agg`, Lambda `bshm-processor` (SQS-triggered ingestion, python3.12) and Lambda `bshm-dashboard-api` (behind API Gateway REST API `pe87xzlj3j`), EC2 instance `i-0248a49cf83500330` (runs the fog node + 10 sensor containers, security group `sg-0da0aeef22d0c9dba` allows only inbound TCP 8000), Elastic IP `54.175.26.119` (allocation `eipalloc-097aa1023dde3a1eb`, associated with that instance), S3 bucket `bshm-frontend-661886400169` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `bshm-deploy-661886400169`. All are prefixed `bshm-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://bshm-frontend-661886400169.s3.us-east-1.amazonaws.com/index.html`, its API at `https://pe87xzlj3j.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 09 (aquaculture-fish-farm) is deployed to a separate real AWS account:

- **Account ID: 713939620116** (AWS Academy Learner Lab, Vocareum-provisioned, student `x24288853@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other ten accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other ten accounts

**Before running any `aws`/deploy command for project 09: confirm `aws sts get-caller-identity` returns account `713939620116`.** If it returns a different account (any of the ten already listed above), STOP and flag it to the user — never deploy project 09 into another project's account or vice versa, they are eleven different students' own Learner Labs.

**This account is not a shared or general-purpose sandbox.** It is Anjaneya Reddy Gurram's (24288853) personal AWS Academy Learner Lab. Project 09 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Deployed via the shared Terraform module (`terraform/`, see its own section above) in a single `terraform apply` in an isolated `aff` workspace (created before ever applying, per the guardrail above — the `default` workspace holds project 07's state and `bshm` holds project 21's). 24 resources created with zero manual AWS CLI steps.

Live resources in this account (as of 2026-07-16, project 09 only, provisioned via `terraform/`): DynamoDB table `aff-readings`, SQS queue `aff-pond-agg`, Lambda `aff-processor` (SQS-triggered ingestion, java17) and Lambda `aff-dashboard-api` (behind API Gateway REST API `245ef52rjf`), EC2 instance `i-04f44183a9a947b3a` (runs the fog node + 10 sensor containers, security group `sg-0f5cf26896fbc37f5` allows only inbound TCP 8000), Elastic IP `100.61.58.69` (allocation `eipalloc-0b0981782e7f41f29`, associated with that instance), S3 bucket `aff-frontend-713939620116` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `aff-deploy-713939620116`. All are prefixed `aff-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://aff-frontend-713939620116.s3.us-east-1.amazonaws.com/index.html`, its API at `https://245ef52rjf.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 06 (offshore-wind-farm) is deployed to a separate real AWS account:

- **Account ID: 015611713565** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25173421@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other accounts

**Before running any `aws`/deploy command for project 06: confirm `aws sts get-caller-identity` returns account `015611713565`.** If it returns any other account, STOP and flag it to the user — never deploy project 06 into another project's account or vice versa, they are twelve different students' own Learner Labs.

**This account is not a shared or general-purpose sandbox.** It is Vishvaksen Machana's (X25173421) personal AWS Academy Learner Lab. Project 06 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Deployed via the shared Terraform module (`terraform/`) in a single `terraform apply` in an isolated `owf` workspace (created before the apply, per the guardrail above — the `default` workspace holds project 07's state, `bshm` holds project 21's, and `aff` holds project 09's, so a fresh workspace was required first). 24 resources created with zero manual AWS CLI steps.

Live resources in this account (as of 2026-07-16, project 06 only, provisioned via `terraform/`): DynamoDB table `owf-readings`, SQS queue `owf-turbine-agg`, Lambda `owf-processor` (SQS-triggered ingestion, nodejs20.x) and Lambda `owf-dashboard-api` (behind API Gateway REST API `zwwf3aohya`), EC2 instance `i-0a808bebdd67990f5` (runs the fog node + 10 sensor containers, security group `sg-025099662fc91f9c9` allows only inbound TCP 8000), Elastic IP `54.227.202.229` (allocation `eipalloc-0f56e99e3976d932d`, associated with that instance), S3 bucket `owf-frontend-015611713565` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `owf-deploy-015611713565`. All are prefixed `owf-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://owf-frontend-015611713565.s3.us-east-1.amazonaws.com/index.html`, its API at `https://zwwf3aohya.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 20 (smart-port-container-terminal) is deployed to a separate real AWS account:

- **Account ID: 659211701832** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25166484@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other accounts

**Before running any `aws`/deploy command for project 20: confirm `aws sts get-caller-identity` returns account `659211701832`.** If it returns any other account, STOP and flag it to the user — never deploy project 20 into another project's account or vice versa, they are thirteen different students' own Learner Labs.

**This account is not a shared or general-purpose sandbox.** It is Uday Kiran Reddy Dodda's (X25166484) personal AWS Academy Learner Lab. Project 20 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Deployed via the shared Terraform module (`terraform/`) in a single `terraform apply` in an isolated `spc` workspace (created before the apply, per the guardrail above; the working dir was switched back to `default` afterward). 24 resources created with zero manual AWS CLI steps.

Live resources in this account (as of 2026-07-17, project 20 only, provisioned via `terraform/`): DynamoDB table `spc-readings`, SQS queue `spc-berth-agg`, Lambda `spc-processor` (SQS-triggered ingestion, java17) and Lambda `spc-dashboard-api` (behind API Gateway REST API `93xrytbtkb`), EC2 instance `i-038501eeaf331757a` (runs the fog node + 10 sensor containers, security group `sg-04546aee5234ee87e` allows only inbound TCP 8000), Elastic IP `54.158.198.173` (allocation `eipalloc-024cbf9f75eb65f66`, associated with that instance), S3 bucket `spc-frontend-659211701832` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `spc-deploy-659211701832`. All are prefixed `spc-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://spc-frontend-659211701832.s3.us-east-1.amazonaws.com/index.html`, its API at `https://93xrytbtkb.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 13 (ev-charging-network) is deployed to a separate real AWS account:

- **Account ID: 350600740537** (AWS Academy Learner Lab, Vocareum-provisioned, student `x24303046@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other accounts

**Before running any `aws`/deploy command for project 13: confirm `aws sts get-caller-identity` returns account `350600740537`.** If it returns any other account, STOP and flag it to the user — never deploy project 13 into another project's account or vice versa, they are fourteen different students' own Learner Labs.

**This account is not a shared or general-purpose sandbox.** It is Nemi Ishwarlal Vikani's (X24303046) personal AWS Academy Learner Lab. Project 13 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Deployed via the shared Terraform module (`terraform/`) in a single `terraform apply` in an isolated `ecn` workspace created before the apply (per the guardrail above; the working dir was switched back to `default` afterward). 24 resources created with zero manual AWS CLI steps.

Live resources in this account (as of 2026-07-17, project 13 only, provisioned via `terraform/`): DynamoDB table `ecn-readings`, SQS queue `ecn-hub-agg`, Lambda `ecn-processor` (SQS-triggered ingestion, python3.12) and Lambda `ecn-dashboard-api` (behind API Gateway REST API `8fu3l2spz0`), EC2 instance `i-04cbd11ce27a03023` (tagged `ecn-fog-host`, runs the fog node + 10 sensor containers, security group `sg-05904819fbe75dc3a` allows only inbound TCP 8000), Elastic IP `52.202.199.193` (allocation `eipalloc-04712ed1aa34e358c`, associated with that instance), S3 bucket `ecn-frontend-350600740537` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `ecn-deploy-350600740537`. All are prefixed `ecn-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://ecn-frontend-350600740537.s3.us-east-1.amazonaws.com/index.html`, its API at `https://8fu3l2spz0.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 11 (water-treatment-utility) is deployed to a separate real AWS account:

- **Account ID: 824792629641** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25176862@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other accounts

**Before running any `aws`/deploy command for project 11: confirm `aws sts get-caller-identity` returns account `824792629641`.** If it returns any other account, STOP and flag it to the user — never deploy project 11 into another project's account or vice versa.

**This account is not a shared or general-purpose sandbox.** It is Rakesh Kunchala's (X25176862) personal AWS Academy Learner Lab. Project 11 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Deployed via the shared Terraform module (`terraform/`) in a single `terraform apply` in an isolated `wtu` workspace created before the apply (per the guardrail above; the working dir was switched back to `default` afterward). `terraform plan` reported "24 to add, 0 to change, 0 to destroy". 24 resources created with zero manual AWS CLI steps.

Live resources in this account (as of 2026-07-17, project 11 only, provisioned via `terraform/`): DynamoDB table `wtu-readings`, SQS queue `wtu-plant-agg`, Lambda `wtu-processor` (SQS-triggered ingestion, nodejs20.x) and Lambda `wtu-dashboard-api` (behind API Gateway REST API `p0ljcrhlj2`), EC2 instance `i-01cd58d3ae4442a6e` (runs the fog node + 10 sensor containers, security group `sg-033b0bf5e0a722a1c` allows only inbound TCP 8000), Elastic IP `3.230.69.192` (allocation `eipalloc-059c30c7b134c47ef`, associated with that instance), S3 bucket `wtu-frontend-824792629641` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `wtu-deploy-824792629641`. All are prefixed `wtu-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://wtu-frontend-824792629641.s3.us-east-1.amazonaws.com/index.html`, its API at `https://p0ljcrhlj2.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 26 (beehive-apiary-monitoring) is deployed to a separate real AWS account:

- **Account ID: 881865707591** (AWS Academy Learner Lab, Vocareum-provisioned, student `x24262404@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other accounts

**Before running any `aws`/deploy command for project 26: confirm `aws sts get-caller-identity` returns account `881865707591`.** If it returns any other account, STOP and flag it to the user — never deploy project 26 into another project's account or vice versa.

**This account is not a shared or general-purpose sandbox.** It is Yashaswini Penumarthi's (X24262404) personal AWS Academy Learner Lab. Project 26 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Deployed via the shared Terraform module (`terraform/`) in a single `terraform apply` in an isolated `bam` workspace created before the apply (per the guardrail above; `aws sts get-caller-identity` was confirmed to return the brand-new account 881865707591 matching Yashaswini Penumarthi's `x24262404` login, not colliding with any account already in use, before anything was applied; the working dir was switched back to `default` afterward). `terraform plan` reported "24 to add, 0 to change, 0 to destroy".

Live resources in this account (as of 2026-07-17, project 26 only, provisioned via `terraform/`): DynamoDB table `bam-readings`, SQS queue `bam-apiary-agg`, Lambda `bam-processor` (SQS-triggered ingestion, nodejs20.x) and Lambda `bam-dashboard-api` (behind API Gateway REST API `0hodaq59re`), EC2 instance `i-04d86643d8710a44e` (tagged `bam-fog-host`, runs the fog node + 10 sensor containers, security group `sg-07598a7e2a3f141a4` allows only inbound TCP 8000), Elastic IP `3.230.213.186` (allocation `eipalloc-07ba2a4130f8b33f8`, associated with that instance), S3 bucket `bam-frontend-881865707591` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `bam-deploy-881865707591`. All are prefixed `bam-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://bam-frontend-881865707591.s3.us-east-1.amazonaws.com/index.html`, its API at `https://0hodaq59re.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 03 (patient-vitals) is deployed to a separate real AWS account:

- **Account ID: 457516959142** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25164414@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other accounts

**Before running any `aws`/deploy command for project 03: confirm `aws sts get-caller-identity` returns account `457516959142`.** If it returns any other account, STOP and flag it to the user — never deploy project 03 into another project's account or vice versa.

**This account is not a shared or general-purpose sandbox.** It is Sri Venkat Bora's (X25164414) personal AWS Academy Learner Lab. Project 03 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Deployed via the shared Terraform module (`terraform/`) in a single `terraform apply` in an isolated `fpv` workspace created before the apply (per the guardrail above; `aws sts get-caller-identity` was confirmed to return the brand-new account 457516959142 matching Venkat's `x25164414` login, not colliding with any account already in use, before anything was applied; the working dir was switched back to `default` afterward). `terraform plan` reported "24 to add, 0 to change, 0 to destroy".

Live resources in this account (as of 2026-07-18, project 03 only, provisioned via `terraform/`): DynamoDB table `fpv-readings`, SQS queue `fpv-vitals-agg`, Lambda `fpv-processor` (SQS-triggered ingestion, nodejs20.x) and Lambda `fpv-dashboard-api` (behind API Gateway REST API `s2unnfc535`), EC2 instance `i-09cd754201f8c0cc6` (tagged `fpv-fog-host`, runs the fog node + 10 sensor containers, security group `sg-07c803a93992428b9` allows only inbound TCP 8000), Elastic IP `100.55.139.153` (allocation `eipalloc-060808e99c87d184e`, associated with that instance), S3 bucket `fpv-frontend-457516959142` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `fpv-deploy-457516959142`. All are prefixed `fpv-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://fpv-frontend-457516959142.s3.us-east-1.amazonaws.com/index.html`, its API at `https://s2unnfc535.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 04 (smart-city) is deployed to a separate real AWS account:

- **Account ID: 109730370597** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25100963@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other accounts

**Before running any `aws`/deploy command for project 04: confirm `aws sts get-caller-identity` returns account `109730370597`.** If it returns any other account, STOP and flag it to the user — never deploy project 04 into another project's account or vice versa.

**This account is not a shared or general-purpose sandbox.** It is Mohammed Hassan Ahmed's (X25100963) personal AWS Academy Learner Lab. Project 04 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Deployed via the shared Terraform module (`terraform/`) in a single `terraform apply` in an isolated `fsc` workspace created before the apply (per the guardrail above; `aws sts get-caller-identity` was confirmed to return the brand-new account 109730370597 matching Mohammed's `x25100963` login, not colliding with any account already in use, before anything was applied; the working dir was switched back to `default` afterward). `terraform plan` reported "24 to add, 0 to change, 0 to destroy".

Live resources in this account (as of 2026-07-18, project 04 only, provisioned via `terraform/`): DynamoDB table `fsc-readings`, SQS queue `fsc-metrics-agg`, Lambda `fsc-processor` (SQS-triggered ingestion, java17) and Lambda `fsc-dashboard-api` (behind API Gateway REST API `ckvirw3e01`), EC2 instance `i-09a7cd01de942ebdd` (tagged `fsc-fog-host`, runs the fog node + 10 sensor containers, security group `sg-06a6124a330cb6605` allows only inbound TCP 8000), Elastic IP `100.61.9.72` (allocation `eipalloc-0dff213a59b413cf2`, associated with that instance), S3 bucket `fsc-frontend-109730370597` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `fsc-deploy-109730370597`. All are prefixed `fsc-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://fsc-frontend-109730370597.s3.us-east-1.amazonaws.com/index.html`, its API at `https://ckvirw3e01.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 05 (cold-chain-logistics) is deployed to a separate real AWS account:

- **Account ID: 911500555248** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25173243@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other accounts

**Before running any `aws`/deploy command for project 05: confirm `aws sts get-caller-identity` returns account `911500555248`.** If it returns any other account, STOP and flag it to the user — never deploy project 05 into another project's account or vice versa.

**This account is not a shared or general-purpose sandbox.** It is Srinidhi Vutkoori's (X25173243) personal AWS Academy Learner Lab. Project 05 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Deployed via the shared Terraform module (`terraform/`) in a single `terraform apply` in an isolated `fcl` workspace created before the apply (per the guardrail above; `aws sts get-caller-identity` was confirmed to return the brand-new account 911500555248 matching Srinidhi's `x25173243` login, not colliding with any account already in use, before anything was applied; the working dir was switched back to `default` afterward). `terraform plan` reported "24 to add, 0 to change, 0 to destroy". Two deploy-only Lambda bugs were found and fixed live: the Python dashboard's FastAPI dependency `pydantic_core` had to be packaged as manylinux2014_x86_64 wheels (the local macOS build fails to import on Lambda), and its FastAPI app mounted a `static/` directory at import time that isn't shipped in the Lambda zip (S3 serves the frontend), so the mount was made tolerant of the absent directory (`check_dir=False`).

Live resources in this account (as of 2026-07-18, project 05 only, provisioned via `terraform/`): DynamoDB table `fcl-readings`, SQS queue `fcl-manifest-agg`, Lambda `fcl-processor` (SQS-triggered ingestion, python3.12) and Lambda `fcl-dashboard-api` (behind API Gateway REST API `zpeplbwe17`, python3.12), EC2 instance `i-08fd56d12b91fb226` (tagged `fcl-fog-host`, runs the fog node + 10 sensor containers, security group `sg-096fa57bb8725efc4` allows only inbound TCP 8000), Elastic IP `34.200.55.91` (allocation `eipalloc-04bf4e7ce49170e85`, associated with that instance), S3 bucket `fcl-frontend-911500555248` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `fcl-deploy-911500555248`. All are prefixed `fcl-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://fcl-frontend-911500555248.s3.us-east-1.amazonaws.com/index.html`, its API at `https://zpeplbwe17.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 17 (solar-farm-monitoring) is deployed to a separate real AWS account:

- **Account ID: 263844967627** (AWS Academy Learner Lab, Vocareum-provisioned, student `x24217808@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other accounts

**Before running any `aws`/deploy command for project 17: confirm `aws sts get-caller-identity` returns account `263844967627`.** If it returns any other account, STOP and flag it to the user — never deploy project 17 into another project's account or vice versa.

**This account is not a shared or general-purpose sandbox.** It is Mahek Naaz's (X24217808) personal AWS Academy Learner Lab. Project 17 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Deployed via the shared Terraform module (`terraform/`) in an isolated `sfm` workspace created before the apply (per the guardrail above; `aws sts get-caller-identity` was confirmed to return the brand-new account 263844967627 matching Mahek's `x24217808` login, not colliding with any account already in use, before anything was applied; the working dir was switched back to `default` afterward). `terraform plan` reported "24 to add, 0 to change, 0 to destroy". One environment-specific deploy note: this account's first default subnet (`data.aws_subnets.default.ids[0]`) sits in availability zone `us-east-1e`, which does not offer the `t3.small` instance type, so the initial EC2 launch failed. Fixed by the new opt-in `fog_availability_zone` module variable (default `""` preserves every other project's behavior byte-for-byte), set to `us-east-1a` in `sfm.tfvars`; the instance now launches in `us-east-1a`. This is an account/AZ-capacity quirk of this Learner Lab, not a project defect — do not carry it into any student-facing document.

Live resources in this account (as of 2026-07-18, project 17 only, provisioned via `terraform/`): DynamoDB table `sfm-readings`, SQS queue `sfm-array-agg`, Lambda `sfm-processor` (SQS-triggered ingestion, python3.12) and Lambda `sfm-dashboard-api` (behind API Gateway REST API `c9wp9ylab7`, python3.12; a self-contained stdlib `ThreadingHTTPServer` driven through an in-memory-socket adapter, no web framework), EC2 instance `i-07ac5f84ff2c413e7` (tagged `sfm-fog-host`, in `us-east-1a`, runs the fog node + 10 sensor containers, security group `sg-078f71bd2fe9a657c` allows only inbound TCP 8000), Elastic IP `54.209.207.199` (allocation `eipalloc-02d9c67f1e87b6d49`, associated with that instance), S3 bucket `sfm-frontend-263844967627` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `sfm-deploy-263844967627`. All are prefixed `sfm-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://sfm-frontend-263844967627.s3.us-east-1.amazonaws.com/index.html`, its API at `https://c9wp9ylab7.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

Project 02 (industrial-equipment) is deployed to a separate real AWS account:

- **Account ID: 964346251483** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25178849@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other accounts

**Before running any `aws`/deploy command for project 02: confirm `aws sts get-caller-identity` returns account `964346251483`.** If it returns any other account, STOP and flag it to the user — never deploy project 02 into another project's account or vice versa.

**This account is not a shared or general-purpose sandbox.** It is Vikas Reddy Amanagantti's (X25178849) personal AWS Academy Learner Lab. Project 02 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Deployed via the shared Terraform module (`terraform/`) in an isolated `fei` workspace created before the apply (per the guardrail above; `aws sts get-caller-identity` was confirmed to return the brand-new account 964346251483 matching Vikas's `x25178849` login, not colliding with any account already in use, before anything was applied; the working dir was switched back to `default` afterward). `terraform plan` reported "24 to add, 0 to change, 0 to destroy". The fog host was pinned to `us-east-1a` via the `fog_availability_zone` module variable in `fei.tfvars` (proactive, after Mahek's project 17 hit the `us-east-1e`/`t3.small` AZ-capacity failure) — internal note only, not for any student document.

Live resources in this account (as of 2026-07-18, project 02 only, provisioned via `terraform/`): DynamoDB table `fei-readings`, SQS queue `fei-sensor-agg`, Lambda `fei-processor` (SQS-triggered ingestion, java17) and Lambda `fei-dashboard-api` (behind API Gateway REST API `dfhmkyn2s5`, java17), EC2 instance `i-0306763de2d29071c` (tagged `fei-fog-host`, in `us-east-1a`, runs the fog node + 10 sensor containers, security group `sg-0790347f2baba7845` allows only inbound TCP 8000), Elastic IP `52.3.81.163` (allocation `eipalloc-09b29317d0190a505`, associated with that instance), S3 bucket `fei-frontend-964346251483` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `fei-deploy-964346251483`. All are prefixed `fei-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://fei-frontend-964346251483.s3.us-east-1.amazonaws.com/index.html`, its API at `https://dfhmkyn2s5.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `fog` field and fresh sensor data depend on fog/sensors running on EC2.

Project 10 (wildfire-forest-monitoring) is deployed to a separate real AWS account:

- **Account ID: 923613097540** (AWS Academy Learner Lab, Vocareum-provisioned, student `x25180754@student.ncirl.ie`)
- Region: `us-east-1` only (same region-lock pattern as the other accounts)
- Role: `voclabs` (session), reuse `LabRole` / `LabInstanceProfile` for anything needing an IAM role or instance profile
- Credentials are temporary (`ASIA`-prefixed) and expire in ~4 hours, same as the other accounts

**Before running any `aws`/deploy command for project 10: confirm `aws sts get-caller-identity` returns account `923613097540`.** If it returns any other account, STOP and flag it to the user — never deploy project 10 into another project's account or vice versa.

**This account is not a shared or general-purpose sandbox.** It is Deekonda Rakshan's (X25180754) personal AWS Academy Learner Lab. Project 10 is not available for any other student in this portfolio to deploy into, redeploy, or reuse as a template against this account.

Deployed via the shared Terraform module (`terraform/`) in an isolated `wfm` workspace created before the apply (per the guardrail above; `aws sts get-caller-identity` was confirmed to return the brand-new account 923613097540 matching Rakshan's `x25180754` login, not colliding with any account already in use, before anything was applied; the working dir was switched back to `default` afterward). `terraform plan` reported "24 to add, 0 to change, 0 to destroy". The fog host was pinned to `us-east-1a` via the `fog_availability_zone` module variable in `wfm.tfvars` (proactive, so the `us-east-1e`/`t3.small` AZ issue could not recur) — internal note only, not for any student document.

Live resources in this account (as of 2026-07-18, project 10 only, provisioned via `terraform/`): DynamoDB table `wfm-readings`, SQS queue `wfm-station-agg`, Lambda `wfm-processor` (SQS-triggered ingestion, nodejs20.x) and Lambda `wfm-dashboard-api` (behind API Gateway REST API `qr6vnedh7g`, nodejs20.x), EC2 instance `i-0239d0ccaf7e631d3` (tagged `wfm-fog-host`, in `us-east-1a`, runs the fog node + 10 sensor containers, security group `sg-08ff17ae1be42e3e4` allows only inbound TCP 8000), Elastic IP `34.239.212.45` (allocation `eipalloc-02fd53f32d745aab4`, associated with that instance), S3 bucket `wfm-frontend-923613097540` (static dashboard frontend, public read-only, static website hosting enabled) and S3 staging bucket `wfm-deploy-923613097540`. All are prefixed `wfm-`. The dashboard Lambda's `FOG_HEALTH_URL`/`FOG_THRESHOLDS_URL` env vars point at this Elastic IP; if it's ever released and reallocated, they need updating.

Live URLs: dashboard at `https://wfm-frontend-923613097540.s3.us-east-1.amazonaws.com/index.html`, its API at `https://qr6vnedh7g.execute-api.us-east-1.amazonaws.com/prod`. The dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and do not depend on the EC2 instance being up; only `/api/health`'s `gateway` field and fresh sensor data depend on fog/sensors running on EC2.

## Attribution

Some projects in this portfolio are individual CA submissions for different students, not all belonging to the same person:

- Project 01 (smart-agriculture): Kondragunta Lakshmi Chaitanya, Student ID X25171216
- Project 19 (smart-mining-safety): Jaipal Kasireddy, Student ID X25156381
- Project 15 (data-center-environmental-monitoring): Nithin, Student ID X25125338
- Project 22 (smart-waste-management): Gundeti Sachin Reddy, Student ID X23432721
- Project 23 (marine-vessel-monitoring): Gopi Krishnan, Student ID X25112627
- Project 24 (wildlife-conservation-monitoring): Hrishikesh Sajeev, Student ID X25132377
- Project 25 (ski-resort-avalanche-safety): Ebin Joseph, Student ID X25142224
- Project 07 (warehouse-robotics-fleet): Goutham Uppu, Student ID X25167936
- Project 10 (wildfire-forest-monitoring): Deekonda Rakshan, Student ID X25180754 (Group B)
- Project 21 (bridge-structural-health): Kasireddy Vadicherla, Student ID X25104047
- Project 06 (offshore-wind-farm): Vishvaksen Machana, Student ID X25173421
- Project 20 (smart-port-container-terminal): Uday Kiran Reddy Dodda, Student ID X25166484
- Project 13 (ev-charging-network): Nemi Ishwarlal Vikani, Student ID X24303046 (Group A)
- Project 11 (water-treatment-utility): Rakesh Kunchala, Student ID X25176862 (Group B)
- Project 09 (aquaculture-fish-farm): Anjaneya Reddy Gurram, Student ID 24288853
- Project 26 (beehive-apiary-monitoring): Yashaswini Penumarthi, Student ID X24262404 (Group A)
- Project 03 (patient-vitals): Sri Venkat Bora, Student ID X25164414
- Project 04 (smart-city): Mohammed Hassan Ahmed, Student ID X25100963 (Group A)
- Project 05 (cold-chain-logistics): Srinidhi Vutkoori, Student ID X25173243 (Group B)
- Project 17 (solar-farm-monitoring): Mahek Naaz, Student ID X24217808 (Group A)
- Project 02 (industrial-equipment): Vikas Reddy Amanagantti, Student ID X25178849 (Group B)

Each project is an independent submission for the student named above.

## Project status

Each project below is an independent submission for its named student. Per-project deployment facts (account, resource IDs, live URLs) are in that project's guardrail block above.

- **Project 22 (smart-waste-management) - Gundeti Sachin Reddy (X23432721):** implementation, tests and AWS deployment done, live and verified end to end. IEEE report finalized. Only the presentation & demo remain.
- **Project 15 (data-center-environmental-monitoring) - Nithin (X25125338):** implementation, 114 tests and deployment done, live and verified in a real browser. 6-page IEEE report finalized. Only the presentation & demo remain.
- **Project 01 (smart-agriculture) - Kondragunta Lakshmi Chaitanya (X25171216):** deployed and verified end to end; 6-page IEEE report finalized (GitHub link left as the standard placeholder for her own repo URL). Its frontend bucket currently returns `NoSuchBucket` (see the live-URLs table) and needs her fresh credentials to redeploy. Only the presentation & demo remain.
- **Project 23 (marine-vessel-monitoring) - Gopi Krishnan (X25112627):** deployed, live and verified end to end in a real browser; 120 tests. IEEE report finalized. Only the GitHub link (placeholder) and presentation & demo remain.
- **Project 24 (wildlife-conservation-monitoring) - Hrishikesh Sajeev (X25132377):** Java project; deployed, live and verified in a real browser; 82 tests. 6-page IEEE report finalized. Only the presentation & demo remain.
- **Project 25 (ski-resort-avalanche-safety) - Ebin Joseph (X25142224):** deployed, live and verified; 121 tests. Redeployed into a replacement lab account (475393590440) after the original session (596691181085) ended; the original resources are orphaned, not deleted. IEEE report finalized. Only the presentation & demo remain.
- **Project 19 (smart-mining-safety) - Jaipal Kasireddy (X25156381):** Java project; deployed, live and verified; 90 tests. IEEE report finalized. Only the presentation & demo remain.
- **Project 07 (warehouse-robotics-fleet) - Goutham Uppu (X25167936):** Java project; deployed live via the Terraform module and verified in a real browser; 127 tests. IEEE report finalized. Only the presentation & demo remain.
- **Project 10 (wildfire-forest-monitoring) - Deekonda Rakshan (X25180754, Group B):** Node project; deployed live (isolated `wfm` workspace, account 923613097540) and verified end to end in a real browser (a dark ranger-station fire-risk board: two stations each with a 0-4 fire-risk gauge and five environmental sensors — temperature, humidity, smoke density, wind speed, soil moisture — a smoke-density trend chart for both stations, fire-detection alerts firing on a smoke spike, and a text health footer `fog gateway/queue/lambda/pipeline: up`); 95 tests. 95 tests. IEEE report finalized (6 pages, unique two-tier "grade before the alarm" framing — the fog raises hard hazard alarms while the dashboard derives a graded 0-4 fire-risk index live on read from earlier/lower thresholds, giving an escalation gradient ahead of any hard alarm; own forest-green Graphviz topology; live dashboard figure; all 16 Lab items; full page-by-page read). Deck + demo script still to build. A decorative conic-gradient app-icon badge was removed from the dashboard header (AI-tell) before capture. Four cross-project references in code comments (buffer.js/sensor.js/publisher.js "(as in 03)"/named other-project classes, app.test.js "project 09") were found by manual reading and fixed. Fog host pre-pinned to `us-east-1a`.
- **Project 21 (bridge-structural-health) - Kasireddy Vadicherla (X25104047):** Python project; deployed live (isolated `bshm` workspace) and verified end to end; 115 tests. Only the presentation & demo remain.
- **Project 09 (aquaculture-fish-farm) - Anjaneya Reddy Gurram (24288853):** Java project; deployed live (isolated `aff` workspace) and verified; 156 tests. Only the presentation & demo remain.
- **Project 06 (offshore-wind-farm) - Vishvaksen Machana (X25173421):** Node project; deployed live (isolated `owf` workspace) and verified with a real-browser screenshot; 71 tests. Minor known nit: `/api/readings` with no `sensor_type` returns 500 rather than 400 (not exercised by the dashboard). Only the presentation & demo remain.
- **Project 20 (smart-port-container-terminal) - Uday Kiran Reddy Dodda (X25166484):** Java project; deployed live (isolated `spc` workspace) and verified in a real browser; 95 tests. Only the presentation & demo remain.
- **Project 13 (ev-charging-network) - Nemi Ishwarlal Vikani (X24303046):** Python/Flask project; deployed live (isolated `ecn` workspace) and verified in a real browser; 121 tests. IEEE report finalized (16 references, unique topology diagram; report zip in `tmp/`). Only the presentation & demo remain.
- **Project 11 (water-treatment-utility) - Rakesh Kunchala (X25176862):** Node project; deployed live (isolated `wtu` workspace, account 824792629641) and verified in a real browser; 115 tests. One deploy-only Lambda bug (dashboard handler treated its third argument, the Lambda runtime callback, as injected clients) was found live and fixed. Dashboard health readout and code identifiers made project-specific. IEEE report + deck + script remain to be built.
- **Project 04 (smart-city) - Mohammed Hassan Ahmed (X25100963, Group A):** Java project; deployed live (isolated `fsc` workspace, account 109730370597) and verified end to end in a real browser (both zones streaming all five metrics, CORS clean, no console errors); 62 tests. IEEE report finalized (6 pages, unique heterogeneous-signals/edge-triage framing + own topology diagram; live dashboard figure captured from the running deployment; verified 3x against brief + Lab checklist). Deck (`ppt/MohammedHassanAhmed_X25100963_smart-city-monitoring.pptx`, band archetype, teal accent, Calibri, live dashboard figure embedded, badge-free cover) and 4-minute demo script (`ppt/..._script.md`, 548 spoken words, unique speaking structure) built and verified. All deliverables staged in `tmp/`. Project 04 complete except the in-class presentation itself.
- **Project 05 (cold-chain-logistics) - Srinidhi Vutkoori (X25173243, Group B):** Python/FastAPI project; deployed live (isolated `fcl` workspace, account 911500555248) and verified end to end in a real browser (two refrigerated containers streaming all five metrics — storage temperature, humidity, door-open seconds, shock, CO2 — with breach detection firing on CONTAINER-2, live temperature trend charts, backend health all green); 76 tests. Two deploy-only Lambda bugs were found and fixed live (manylinux `pydantic_core` wheels; `check_dir=False` on the static mount). IEEE report finalized (6 pages, unique cold-chain/excursion-detection framing + own steel-blue topology diagram; live dashboard figure captured from the running deployment; the two deploy bugs written up as genuine findings; verified page-by-page against brief + Lab checklist). Deck (`ppt/SrinidhiVutkoori_X25173243_cold-chain-logistics.pptx`, corner/emblem archetype, cobalt `#2452a8` accent, Cambria/Calibri, live dashboard figure, badge-free cover; hardest-part reworked off the shared pagination story to the unique deploy-bug narrative) and 4-minute demo script (`ppt/..._script.md`, 534 words / 3:57, stakes-first structure) built and verified. All deliverables staged in `tmp/`. Project 05 complete except the in-class presentation itself.
- **Project 17 (solar-farm-monitoring) - Mahek Naaz (X24217808, Group A):** Python project (self-contained stdlib `ThreadingHTTPServer` dashboard, no web framework); deployed live (isolated `sfm` workspace, account 263844967627) and verified end to end in a real browser (two arrays streaming all five metrics — irradiance, panel temperature, inverter output, DC voltage, soiling index — with a live per-window efficiency heatmap, an inverter-output trend chart, and breach detection firing on array-2 for `inverter_underperformance` + `undervoltage_fault`; all four health indicators green). 99 tests. IEEE report finalized (6 pages, unique efficiency-grade/heatmap framing — the serving layer fuses inverter output + panel temperature into a graded 0-100 efficiency index rendered as a per-window heatmap; own warm-gold Graphviz topology diagram; live dashboard figure from the running deployment; all 16 Lab items documented in prose; verified page-by-page, code+readme scanned clean of cross-project/other-student references). Deck + demo script still to build. The dashboard health readout was redesigned from a beige-circle/blue-dot AI-tell to clean green/red status pills before figure capture. One env quirk handled at deploy time (account's first default subnet in `us-east-1e`, which lacks `t3.small`; pinned to `us-east-1a` via the opt-in `fog_availability_zone` module variable) — internal note only, not for any student document.
- **Project 02 (industrial-equipment) - Vikas Reddy Amanagantti (X25178849, Group B):** Java project; deployed live (isolated `fei` workspace, account 964346251483) and verified end to end in a real browser (a dark predictive-maintenance "Plant Floor Monitor": five machine sensors — vibration, motor temperature, bearing acoustic, rotation speed, power draw — across two production lines, per-line readings + meters + sparkline trends, an active alarm firing on line-1 rotation-speed underspeed, and a GATEWAY/QUEUE/LAMBDA/PIPELINE status bar all green). 46 tests. IEEE report finalized (6 pages, unique predictive-maintenance framing — the rotation-speed signal uniquely carries a two-sided band, faulted at both floor and ceiling, unlike the four single-limit signals; own gunmetal-grey Graphviz topology; live dashboard figure; all 16 Lab items documented; full page-by-page read; code+readme scanned clean of cross-project/other-student refs). Deck + demo script still to build. Fog host proactively pinned to `us-east-1a` (`fog_availability_zone` in `fei.tfvars`) so the `us-east-1e`/`t3.small` AZ issue could not recur — internal note only, not for any student document.
