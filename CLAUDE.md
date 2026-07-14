# fec_version_1

NCI H9FECC (Fog and Edge Computing) CA coursework portfolio. Brief: `FEC Project Descript.md`.

## AWS deployment guardrail

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

## Attribution

Some projects in this portfolio are individual CA submissions for different students, not all belonging to the same person:

- Project 01 (smart-agriculture): Kondragunta Lakshmi Chaitanya, Student ID X25171216
- Project 15 (data-center-environmental-monitoring): Nithin, Student ID X25125338
- Project 22 (smart-waste-management): Gundeti Sachin Reddy, Student ID X23432721

Each such project's own `readme.txt` carries an ATTRIBUTION section with the same detail (check there before assuming a project belongs to the main portfolio owner).

## Project status

Project 22 (smart-waste-management) is functionally complete: sensor/fog/backend/dashboard implementation, unit and integration tests, and the real AWS deployment described above are all done and live. The report (`documents/Gundeti_Sachin_Reddy_X23432721/report.docx`) has had every concrete defect a multi-agent rubric re-verification found addressed: the deployment-topology figure (was clipped to column width, hiding 5 of 9 components), reference-list numbering (now strict IEEE order-of-first-citation, 1-21), missing reference page numbers, repetitive "rather than"/"genuine" style tics, and remaining long sentences. Reference list expanded 10 → 21 with independently verified peer-reviewed sources. Only the presentation & demo (20% of the grade) remains undelivered — that is a human action, not something further report editing can address.

Project 15 (data-center-environmental-monitoring) is functionally complete: sensor/fog/backend/dashboard implementation, unit tests (114 total), and the real AWS deployment described above are all done and live, following the same rigor as project 22: two credential-handling bugs proactively found and fixed before deployment (three files silently fell back to hardcoded LocalStack-only credentials, which would have broken authentication in real Lambda/EC2 exactly like project 22's earlier bug — fixed with three genuinely distinct code shapes, not copy-pasted from project 22's fix or from each other), plus the same DynamoDB Scan-pagination undercount bug found and fixed in `pipelineStatus.js`. End-to-end pipeline independently verified live: real sensor data flows through fog, SQS, both Lambdas, DynamoDB, API Gateway, and renders on the S3-hosted dashboard with zero console errors. The 6-page IEEE report (`documents/Nithin_X25125338/report.docx`) is structurally complete (all 7 brief-required elements present, GitHub link included, H1-level code verified independently for both Sensor/Fog and Backend) — a style-tic/long-sentence language polish pass is in progress to move the Technical Report score off the H2.1/H2.2 boundary. Only the presentation & demo (20% of the grade) remains undelivered otherwise.

Project 01 (smart-agriculture) was reassigned from the main portfolio to Chaitanya (X25171216) on 2026-07-14 and is just starting: her own AWS account (733939924597) is confirmed live, but no code audit, deployment, or report work has been done yet.
