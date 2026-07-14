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

## Attribution

Some projects in this portfolio are individual CA submissions for different students, not all belonging to the same person:

- Project 15 (data-center-environmental-monitoring): Nithin, Student ID X25125338
- Project 22 (smart-waste-management): Gundeti Sachin Reddy, Student ID X23432721

Each such project's own `readme.txt` carries an ATTRIBUTION section with the same detail (check there before assuming a project belongs to the main portfolio owner).

## Project status

Project 22 (smart-waste-management) is functionally complete: sensor/fog/backend/dashboard implementation, unit and integration tests, and the real AWS deployment described above are all done and live. The report (`documents/Gundeti_Sachin_Reddy_X23432721/report.docx`) has had every concrete defect a multi-agent rubric re-verification found addressed: the deployment-topology figure (was clipped to column width, hiding 5 of 9 components), reference-list numbering (now strict IEEE order-of-first-citation, 1-21), missing reference page numbers, repetitive "rather than"/"genuine" style tics, and remaining long sentences. Reference list expanded 10 → 21 with independently verified peer-reviewed sources. Only the presentation & demo (20% of the grade) remains undelivered — that is a human action, not something further report editing can address.
